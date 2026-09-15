import type { Executor } from '@revy/db'
import { PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import type { CreateReviewInput, UpdateReviewInput } from '@revy/shared/schemas'
import type { Paginated, Review } from '@revy/shared/types'
import { errors, isReleased, isValidScore, toHalfSteps, toScore } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toUserSummary } from '../mappers'
import {
  activityRepository,
  mediaRepository,
  ratingRepository,
  reviewRepository,
  userRepository,
} from '../repositories'
import { badgeService } from './badge.service'
import { xpService } from './xp.service'

/**
 * Reviews (SPEC 11).
 *
 * A review may carry a rating, and writing one with a score rates the media in
 * the same transaction rather than making the client fire two requests that
 * could half-fail.
 */
export const reviewService = {
  async create(ctx: ServiceContext, input: CreateReviewInput): Promise<Review> {
    const auth = requireViewer(ctx)

    if (input.score != null && !isValidScore(input.score)) throw errors.invalidScore()

    const media = await mediaRepository.findById(auth.db, input.mediaId)
    if (!media) throw errors.mediaNotFound()

    // Same rule as rating: a review of something nobody has seen is not a
    // review. A review can also carry a score, so leaving this out would be a
    // way round the rating check rather than merely an oversight.
    if (!isReleased(media.releaseDate)) throw errors.notReleased('review')

    const existing = await reviewRepository.findByUserAndMedia(
      auth.db,
      auth.viewerId,
      input.mediaId,
    )
    if (existing) {
      throw errors.notFound(
        'REVIEW_ALREADY_EXISTS',
        'You have already reviewed this. Edit your existing review instead.',
      )
    }

    return auth.db.transaction(async (tx) => {
      let ratingId: string | null = null
      let score: number | null = null

      if (input.score != null) {
        const halfSteps = toHalfSteps(input.score)
        const previous = await ratingRepository.find(tx, auth.viewerId, input.mediaId)
        const rating = await ratingRepository.upsert(tx, auth.viewerId, input.mediaId, halfSteps)

        await mediaRepository.applyRatingDelta(
          tx,
          input.mediaId,
          halfSteps,
          previous?.score ?? null,
        )

        ratingId = rating.id
        score = toScore(rating.score)

        if (!previous) {
          await xpService.award(tx, auth.viewerId, 'rate_media')
          await badgeService.evaluate(tx, auth.viewerId, 'rating')
        }
      }

      const review = await reviewRepository.create(tx, {
        userId: auth.viewerId,
        mediaId: input.mediaId,
        ratingId,
        content: input.content,
        spoiler: input.spoiler,
        // Defaulted in the column too, so a client that never sends one stores
        // a real language rather than a null nobody can filter on.
        ...(input.language ? { language: input.language } : {}),
      })

      // A review supersedes the bare rating card for the same title, so the
      // feed shows the richer item rather than both.
      await activityRepository.removeForMedia(tx, auth.viewerId, input.mediaId, 'rated_media')
      await activityRepository.create(tx, {
        userId: auth.viewerId,
        type: 'reviewed_media',
        mediaId: input.mediaId,
        reviewId: review.id,
        ratingId,
      })

      await xpService.award(tx, auth.viewerId, 'write_review')
      await badgeService.evaluate(tx, auth.viewerId, 'review')

      return {
        id: review.id,
        user: toUserSummary(await requireUser(tx, auth.viewerId)),
        mediaId: review.mediaId,
        score,
        content: review.content,
        language: review.language,
        spoiler: review.spoiler,
        likeCount: 0,
        commentCount: 0,
        likedByViewer: false,
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
      }
    })
  },

  /** Edits a review. Only the author may (SPEC 27). */
  async update(ctx: ServiceContext, reviewId: string, input: UpdateReviewInput): Promise<Review> {
    const auth = requireViewer(ctx)

    const review = await reviewRepository.findById(auth.db, reviewId)
    if (!review) throw errors.notFound('REVIEW_NOT_FOUND', 'Review not found.')
    if (review.userId !== auth.viewerId) throw errors.forbidden('You can only edit your own review.')

    if (input.score != null && !isValidScore(input.score)) throw errors.invalidScore()

    return auth.db.transaction(async (tx) => {
      let ratingId = review.ratingId
      let score: number | null = null

      if (input.score != null) {
        const halfSteps = toHalfSteps(input.score)
        const previous = await ratingRepository.find(tx, auth.viewerId, review.mediaId)
        const rating = await ratingRepository.upsert(tx, auth.viewerId, review.mediaId, halfSteps)
        await mediaRepository.applyRatingDelta(
          tx,
          review.mediaId,
          halfSteps,
          previous?.score ?? null,
        )
        ratingId = rating.id
        score = toScore(rating.score)
      } else if (ratingId) {
        const rating = await ratingRepository.findById(tx, ratingId)
        score = rating ? toScore(rating.score) : null
      }

      const updated = await reviewRepository.update(tx, reviewId, {
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.spoiler !== undefined ? { spoiler: input.spoiler } : {}),
        ratingId,
      })
      if (!updated) throw errors.notFound('REVIEW_NOT_FOUND', 'Review not found.')

      const author = await requireUser(tx, auth.viewerId)

      return {
        id: updated.id,
        user: toUserSummary(author),
        mediaId: updated.mediaId,
        score,
        content: updated.content,
        language: updated.language,
        spoiler: updated.spoiler,
        likeCount: updated.likeCount,
        commentCount: updated.commentCount,
        likedByViewer: false,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      }
    })
  },

  async remove(ctx: ServiceContext, reviewId: string): Promise<void> {
    const auth = requireViewer(ctx)

    const review = await reviewRepository.findById(auth.db, reviewId)
    if (!review) throw errors.notFound('REVIEW_NOT_FOUND', 'Review not found.')
    if (review.userId !== auth.viewerId) {
      throw errors.forbidden('You can only delete your own review.')
    }

    await auth.db.transaction(async (tx) => {
      await reviewRepository.remove(tx, reviewId)
      await xpService.revoke(tx, auth.viewerId, 'write_review')
      // The activity row cascades from the review's deletion.
    })
  },

  /** Reviews for a media page, newest first (SPEC 19, 38). */
  async listForMedia(
    ctx: ServiceContext,
    mediaId: string,
    limit = PAGE_SIZE_DEFAULT,
    cursor: string | null = null,
  ): Promise<Paginated<Review>> {
    const rows = await reviewRepository.listForMedia(
      ctx.db,
      mediaId,
      limit + 1,
      parseCursor(cursor),
    )

    // Fetching one extra row is how we know whether another page exists
    // without a second COUNT query.
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    const likedIds = ctx.viewerId
      ? await reviewRepository.findLikedBy(
          ctx.db,
          ctx.viewerId,
          page.map((row) => row.review.id),
        )
      : new Set<string>()

    return {
      items: page.map((row) => ({
        id: row.review.id,
        user: toUserSummary(row.user),
        mediaId: row.review.mediaId,
        score: row.score === null ? null : toScore(row.score),
        content: row.review.content,
        language: row.review.language,
        spoiler: row.review.spoiler,
        likeCount: row.review.likeCount,
        commentCount: row.review.commentCount,
        likedByViewer: likedIds.has(row.review.id),
        createdAt: row.review.createdAt.toISOString(),
        updatedAt: row.review.updatedAt.toISOString(),
      })),
      nextCursor: hasMore ? (page[page.length - 1]?.review.createdAt.toISOString() ?? null) : null,
    }
  },

  async like(ctx: ServiceContext, reviewId: string): Promise<void> {
    const auth = requireViewer(ctx)
    await reviewRepository.like(auth.db, auth.viewerId, reviewId)
  },

  async unlike(ctx: ServiceContext, reviewId: string): Promise<void> {
    const auth = requireViewer(ctx)
    await reviewRepository.unlike(auth.db, auth.viewerId, reviewId)
  },
}

/** Cursors are ISO timestamps; anything unparseable is treated as page one. */
function parseCursor(cursor: string | null): Date | null {
  if (!cursor) return null
  const date = new Date(cursor)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Loads the author row, which every review response embeds. */
async function requireUser(db: Executor, userId: string) {
  const user = await userRepository.findById(db, userId)
  if (!user) throw errors.userNotFound()
  return user
}
