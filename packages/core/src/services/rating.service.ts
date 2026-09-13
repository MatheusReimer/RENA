import type { SetMediaStatusInput, UpsertRatingInput } from '@revy/shared/schemas'
import type { MediaStatus, Rating } from '@revy/shared/types'
import { errors, isValidScore, toHalfSteps, toScore } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { activityRepository, mediaRepository, ratingRepository } from '../repositories'
import { badgeService } from './badge.service'
import { xpService } from './xp.service'

/**
 * Rating and consumption status (SPEC 9, 10).
 *
 * Rating a title is the single most common write in the product and it touches
 * five tables: the rating, the media aggregate, the activity feed, XP, and
 * possibly a badge. All of it runs in one transaction -- a feed card for a
 * rating that failed to save, or XP for a rating that rolled back, would be
 * worse than the write failing outright.
 */
export const ratingService = {
  async upsert(ctx: ServiceContext, input: UpsertRatingInput): Promise<Rating> {
    const auth = requireViewer(ctx)

    // Validated by Zod at the edge; re-checked here because a service must be
    // safe to call from anywhere, not just from behind its HTTP handler.
    if (!isValidScore(input.score)) throw errors.invalidScore()

    const media = await mediaRepository.findById(auth.db, input.mediaId)
    if (!media) throw errors.mediaNotFound()

    const halfSteps = toHalfSteps(input.score)

    return auth.db.transaction(async (tx) => {
      const previous = await ratingRepository.find(tx, auth.viewerId, input.mediaId)
      const rating = await ratingRepository.upsert(tx, auth.viewerId, input.mediaId, halfSteps)

      await mediaRepository.applyRatingDelta(
        tx,
        input.mediaId,
        halfSteps,
        previous?.score ?? null,
      )

      // Re-rating replaces the existing feed card rather than adding a second
      // one, so a friend's timeline shows one entry per title.
      await activityRepository.removeForMedia(tx, auth.viewerId, input.mediaId, 'rated_media')
      await activityRepository.create(tx, {
        userId: auth.viewerId,
        type: 'rated_media',
        mediaId: input.mediaId,
        ratingId: rating.id,
      })

      // XP is for rating something new. Changing your mind about a score is
      // not a new contribution, so it earns nothing.
      if (!previous) {
        await xpService.award(tx, auth.viewerId, 'rate_media')
        await badgeService.evaluate(tx, auth.viewerId, 'rating')
      }

      return {
        id: rating.id,
        userId: rating.userId,
        mediaId: rating.mediaId,
        score: toScore(rating.score),
        createdAt: rating.createdAt.toISOString(),
        updatedAt: rating.updatedAt.toISOString(),
      }
    })
  },

  /** Removes the viewer's rating and reverses its effect on the aggregate. */
  async remove(ctx: ServiceContext, mediaId: string): Promise<void> {
    const auth = requireViewer(ctx)

    await auth.db.transaction(async (tx) => {
      const removed = await ratingRepository.remove(tx, auth.viewerId, mediaId)
      if (!removed) return

      await mediaRepository.applyRatingDelta(tx, mediaId, null, removed.score)
      await activityRepository.removeForMedia(tx, auth.viewerId, mediaId, 'rated_media')
      await xpService.revoke(tx, auth.viewerId, 'rate_media')
    })
  },

  /**
   * Sets consumption status (SPEC 9).
   *
   * Timestamps are derived from the transition rather than trusted from the
   * client: starting something stamps `started_at`, finishing stamps
   * `completed_at`, and neither is ever overwritten by a later re-entry into
   * the same state.
   */
  async setStatus(ctx: ServiceContext, input: SetMediaStatusInput): Promise<void> {
    const auth = requireViewer(ctx)

    const media = await mediaRepository.findById(auth.db, input.mediaId)
    if (!media) throw errors.mediaNotFound()

    if (input.status === null) {
      await ratingRepository.clearStatus(auth.db, auth.viewerId, input.mediaId)
      return
    }

    const status: MediaStatus = input.status

    await auth.db.transaction(async (tx) => {
      const existing = await ratingRepository.findStatus(tx, auth.viewerId, input.mediaId)
      if (existing?.status === status) return

      const now = new Date()
      const startedAt =
        existing?.startedAt ?? (status === 'in_progress' || status === 'completed' ? now : null)
      const completedAt = status === 'completed' ? (existing?.completedAt ?? now) : null

      await ratingRepository.setStatus(tx, auth.viewerId, input.mediaId, status, {
        startedAt,
        completedAt,
      })

      // Only finishing something is feed-worthy. 'Want to watch' is a private
      // planning action and would flood friends' timelines.
      if (status === 'completed') {
        await activityRepository.removeForMedia(
          tx,
          auth.viewerId,
          input.mediaId,
          'completed_media',
        )
        await activityRepository.create(tx, {
          userId: auth.viewerId,
          type: 'completed_media',
          mediaId: input.mediaId,
        })

        // Awarded once per title: re-completing a rewatch earns nothing.
        if (existing?.completedAt === null || existing === null) {
          await xpService.award(tx, auth.viewerId, 'complete_media')
        }
      }
    })
  },

  async getForViewer(ctx: ServiceContext, mediaId: string): Promise<number | null> {
    if (!ctx.viewerId) return null
    const rating = await ratingRepository.find(ctx.db, ctx.viewerId, mediaId)
    return rating ? toScore(rating.score) : null
  },
}
