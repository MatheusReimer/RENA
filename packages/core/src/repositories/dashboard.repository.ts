import { type Executor, schema } from '@revy/db'
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

/**
 * Queries for the signed-in home screen.
 *
 * Its own file rather than more of `discover.repository`: everything here is
 * scoped to one viewer, and Discover's queries are deliberately not -- mixing
 * them would make it easy to forget which is which and leak one person's
 * library into a public rail.
 */

/**
 * The activity panel's counters, in one round trip.
 *
 * Correlated subqueries rather than five separate queries: the panel needs all
 * of them together and none is expensive on its own given the per-user
 * indexes. This mirrors `userRepository.getStats`, which does the same thing
 * for the profile header -- the two differ in which counters they need, and
 * merging them would mean every profile view paying for likes-received.
 */
export async function dashboardActivity(db: Executor, userId: string) {
  const [row] = await db
    .select({
      ratingCount: sql<number>`(
        SELECT count(*)::int FROM ${schema.ratings}
        WHERE ${schema.ratings.userId} = ${userId}
      )`,
      reviewCount: sql<number>`(
        SELECT count(*)::int FROM ${schema.reviews}
        WHERE ${schema.reviews.userId} = ${userId}
      )`,
      /*
       * Both kinds of comment, added together.
       *
       * They are separate tables because they hang off different parents -- a
       * review and a discussion thread -- but to the person who wrote them
       * they are the same act, and a panel that counted only one would be
       * telling them they had written half as much as they had.
       */
      commentCount: sql<number>`(
        SELECT
          (SELECT count(*)::int FROM ${schema.reviewComments}
           WHERE ${schema.reviewComments.userId} = ${userId})
          +
          (SELECT count(*)::int FROM ${schema.discussionComments}
           WHERE ${schema.discussionComments.userId} = ${userId})
      )`,
      /*
       * Likes *received*, not given.
       *
       * The sum of the denormalised counters on this member's own reviews,
       * which is why it is a sum rather than a count -- the like rows
       * themselves are maintained transactionally alongside these totals, and
       * counting them again here would be the slower way to get the same
       * number.
       */
      likesReceived: sql<number>`(
        SELECT coalesce(sum(${schema.reviews.likeCount}), 0)::int FROM ${schema.reviews}
        WHERE ${schema.reviews.userId} = ${userId}
      )`,
      friendCount: sql<number>`(
        SELECT count(*)::int FROM ${schema.friendships}
        WHERE ${schema.friendships.status} = 'accepted'
          AND (${schema.friendships.requesterId} = ${userId}
               OR ${schema.friendships.receiverId} = ${userId})
      )`,
    })
    .from(sql`(SELECT 1) AS placeholder`)

  return (
    row ?? {
      ratingCount: 0,
      reviewCount: 0,
      commentCount: 0,
      likesReceived: 0,
      friendCount: 0,
    }
  )
}

/**
 * The sidebar's library counters.
 *
 * Watchlist, readlist and playlist are the same `planned` status split by what
 * kind of thing it is -- the model has always been generic and the labels have
 * always been per-type (see `MEDIA_STATUS_LABELS`). Three named lists would be
 * three tables for one column's worth of information.
 */
export async function libraryCounts(db: Executor, userId: string) {
  /*
   * A sub-select on media rather than a join, and the reason is a real trap.
   *
   * Interpolating `${schema.media.id}` inside a raw `sql` template emits the
   * bare column name, not a qualified one -- so the join condition rendered as
   * `ON "id" = "media_id"` and Postgres rejected it as ambiguous, both tables
   * having an `id`. Filtering by membership keeps each column in a scope where
   * exactly one table can own it.
   */
  const plannedOf = (types: readonly string[]) => sql<number>`(
    SELECT count(*)::int FROM ${schema.userMedia}
    WHERE ${schema.userMedia.userId} = ${userId}
      AND ${schema.userMedia.status} = 'planned'
      AND ${schema.userMedia.mediaId} IN (
        SELECT ${schema.media.id} FROM ${schema.media}
        WHERE ${schema.media.mediaType} IN (${sql.join(
          types.map((type) => sql`${type}`),
          sql`, `,
        )})
      )
  )`

  const [row] = await db
    .select({
      watchlist: plannedOf(['movie', 'series']),
      readlist: plannedOf(['book']),
      playlist: plannedOf(['game']),
      reviews: sql<number>`(
        SELECT count(*)::int FROM ${schema.reviews}
        WHERE ${schema.reviews.userId} = ${userId}
      )`,
      liked: sql<number>`(
        SELECT count(*)::int FROM ${schema.reviewLikes}
        WHERE ${schema.reviewLikes.userId} = ${userId}
      )`,
      history: sql<number>`(
        SELECT count(*)::int FROM ${schema.userMedia}
        WHERE ${schema.userMedia.userId} = ${userId}
          AND ${schema.userMedia.status} = 'completed'
      )`,
    })
    .from(sql`(SELECT 1) AS placeholder`)

  return (
    row ?? { watchlist: 0, readlist: 0, playlist: 0, reviews: 0, liked: 0, history: 0 }
  )
}

/** The window a review's length has to fall in to carry a headline and a body. */
const REVIEW_MIN_LENGTH = 60
const REVIEW_MAX_LENGTH = 600

/**
 * Reviews for the dashboard's trending row, optionally of one media type.
 *
 * Most-liked first within the recent window, so the row shows writing the
 * community itself endorsed rather than whatever was posted last. Spoilers are
 * excluded: everywhere else a spoiler sits behind `SpoilerGuard` and the
 * reader chooses, and a row that scrolls past on the home screen is not a
 * choice.
 */
export async function dashboardReviews(
  db: Executor,
  mediaType: string | null,
  limit: number,
) {
  const conditions = [
    eq(schema.reviews.spoiler, false),
    isNotNull(schema.media.coverImageUrl),
    sql`char_length(${schema.reviews.content}) BETWEEN ${REVIEW_MIN_LENGTH} AND ${REVIEW_MAX_LENGTH}`,
  ]
  if (mediaType) conditions.push(eq(schema.media.mediaType, mediaType as 'movie'))

  return db
    .select({
      id: schema.reviews.id,
      content: schema.reviews.content,
      likeCount: schema.reviews.likeCount,
      commentCount: schema.reviews.commentCount,
      createdAt: schema.reviews.createdAt,
      score: schema.ratings.score,
      mediaId: schema.media.id,
      mediaTitle: schema.media.title,
      mediaType: schema.media.mediaType,
      coverImageUrl: schema.media.coverImageUrl,
      authorId: schema.users.id,
      authorUsername: schema.users.username,
      authorDisplayName: schema.users.displayName,
      authorAvatarUrl: schema.users.avatarUrl,
      authorTitleSlug: schema.users.titleBadgeSlug,
    })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .innerJoin(schema.media, eq(schema.media.id, schema.reviews.mediaId))
    // Left, not inner: a review written without a score is still a review.
    .leftJoin(schema.ratings, eq(schema.ratings.id, schema.reviews.ratingId))
    .where(and(...conditions))
    .orderBy(desc(schema.reviews.likeCount), desc(schema.reviews.createdAt))
    .limit(limit)
}

/**
 * What friends are part-way through, one row per friend.
 *
 * `DISTINCT ON` keeps the most recent item per person: the panel is a list of
 * people, and somebody who started four things this week should appear once
 * rather than filling it.
 */
export async function friendsInProgress(db: Executor, friendIds: string[], limit: number) {
  if (friendIds.length === 0) return []

  return db
    .selectDistinctOn([schema.userMedia.userId], {
      updatedAt: schema.userMedia.updatedAt,
      mediaId: schema.media.id,
      mediaTitle: schema.media.title,
      mediaType: schema.media.mediaType,
      userId: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      titleBadgeSlug: schema.users.titleBadgeSlug,
    })
    .from(schema.userMedia)
    .innerJoin(schema.media, eq(schema.media.id, schema.userMedia.mediaId))
    .innerJoin(schema.users, eq(schema.users.id, schema.userMedia.userId))
    .where(
      and(
        inArray(schema.userMedia.userId, friendIds),
        eq(schema.userMedia.status, 'in_progress'),
      ),
    )
    .orderBy(schema.userMedia.userId, desc(schema.userMedia.updatedAt))
    .limit(limit)
}

/**
 * The title the recommendations row is named after.
 *
 * The viewer's most recently rated favourite -- most recent first so the
 * heading tracks what they are actually into now, rather than naming
 * something they loved two years ago every time they open the page.
 *
 * Null when they have not rated anything highly yet, and the caller drops the
 * row entirely rather than printing "Because you liked null".
 */
export async function recommendationAnchor(db: Executor, userId: string) {
  /** Ratings of 4.0 and up, i.e. 8 half-steps. Matches `similarToUserTaste`. */
  const LIKED_THRESHOLD = 8

  const [row] = await db
    .select({ title: schema.media.title })
    .from(schema.ratings)
    .innerJoin(schema.media, eq(schema.media.id, schema.ratings.mediaId))
    .where(
      and(
        eq(schema.ratings.userId, userId),
        sql`${schema.ratings.score} >= ${LIKED_THRESHOLD}`,
      ),
    )
    .orderBy(desc(schema.ratings.createdAt))
    .limit(1)

  return row?.title ?? null
}
