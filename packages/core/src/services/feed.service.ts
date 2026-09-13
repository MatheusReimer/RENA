import { FEED_PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import type { FeedQueryInput } from '@revy/shared/schemas'
import type { Activity, Paginated } from '@revy/shared/types'
import { excerpt, toScore } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import { activityRepository, friendshipRepository } from '../repositories'

/**
 * The activity feed (SPEC 13, 18).
 *
 * Fan-out on read: gather the viewer's friend ids, then scan activity by those
 * users newest-first. SPEC 13 explicitly scopes the MVP to chronological
 * friend activity with no ranking, and this does exactly that and no more.
 */
export const feedService = {
  async getFeed(ctx: ServiceContext, input: FeedQueryInput): Promise<Paginated<Activity>> {
    const auth = requireViewer(ctx)
    const limit = input.limit ?? FEED_PAGE_SIZE_DEFAULT

    const friendIds = await friendshipRepository.listFriendIds(auth.db, auth.viewerId)

    // 'for-you' mixes in your own activity so a new user with no friends still
    // sees their own history rather than an empty screen.
    const userIds =
      input.scope === 'following' ? friendIds : [...new Set([...friendIds, auth.viewerId])]

    if (userIds.length === 0) return { items: [], nextCursor: null }

    return loadActivities(ctx, userIds, limit, input.cursor ?? null)
  },

  /** One user's activity, for their profile (SPEC 22). */
  async getUserActivity(
    ctx: ServiceContext,
    userId: string,
    limit = FEED_PAGE_SIZE_DEFAULT,
    cursor: string | null = null,
  ): Promise<Paginated<Activity>> {
    return loadActivities(ctx, [userId], limit, cursor)
  },

  async like(ctx: ServiceContext, activityId: string): Promise<void> {
    const auth = requireViewer(ctx)
    await activityRepository.like(auth.db, auth.viewerId, activityId)
  },

  async unlike(ctx: ServiceContext, activityId: string): Promise<void> {
    const auth = requireViewer(ctx)
    await activityRepository.unlike(auth.db, auth.viewerId, activityId)
  },
}

async function loadActivities(
  ctx: ServiceContext,
  userIds: string[],
  limit: number,
  cursor: string | null,
): Promise<Paginated<Activity>> {
  // One extra row tells us whether another page exists without a COUNT.
  const rows = await activityRepository.listForUsers(
    ctx.db,
    userIds,
    limit + 1,
    parseCursor(cursor),
  )

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows

  const likedIds = ctx.viewerId
    ? await activityRepository.findLikedBy(
        ctx.db,
        ctx.viewerId,
        page.map((row) => row.activity.id),
      )
    : new Set<string>()

  const items: Activity[] = page.map((row) => ({
    id: row.activity.id,
    type: row.activity.type,
    user: toUserSummary(row.user),
    media: row.media ? toMedia(row.media) : null,
    score: row.ratingScore === null ? null : toScore(row.ratingScore),
    review: row.review
      ? {
          id: row.review.id,
          // The feed shows a teaser; the full text lives on the media page.
          excerpt: excerpt(row.review.content, 180),
          spoiler: row.review.spoiler,
        }
      : null,
    list: row.list
      ? {
          id: row.list.id,
          name: row.list.name,
          description: row.list.description,
          visibility: row.list.visibility,
          itemCount: row.list.itemCount,
          previewCovers: [],
          createdAt: row.list.createdAt.toISOString(),
          updatedAt: row.list.updatedAt.toISOString(),
        }
      : null,
    likeCount: row.activity.likeCount,
    commentCount: row.activity.commentCount,
    likedByViewer: likedIds.has(row.activity.id),
    createdAt: row.activity.createdAt.toISOString(),
  }))

  return {
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.createdAt ?? null) : null,
  }
}

/** Cursors are ISO timestamps; anything unparseable restarts at page one. */
function parseCursor(cursor: string | null): Date | null {
  if (!cursor) return null
  const date = new Date(cursor)
  return Number.isNaN(date.getTime()) ? null : date
}
