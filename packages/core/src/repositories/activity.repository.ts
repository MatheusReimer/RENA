import { type Executor, schema } from '@revy/db'
import type { ActivityType } from '@revy/shared/types'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { notBlocked } from './filters'

/** Data access for the activity feed (SPEC 13, 18). */

type ActivityRow = typeof schema.activities.$inferSelect

export const activityRepository = {
  async create(
    db: Executor,
    values: typeof schema.activities.$inferInsert,
  ): Promise<ActivityRow> {
    const [row] = await db.insert(schema.activities).values(values).returning()
    return row!
  },

  /**
   * Removes the prior activity of a type for a (user, media) pair.
   *
   * Re-rating a film should move it to the top of friends' feeds, not append a
   * second "rated Dune" card next to the first. Called before inserting the
   * replacement, inside the same transaction.
   */
  async removeForMedia(
    db: Executor,
    userId: string,
    mediaId: string,
    type: ActivityRow['type'],
  ): Promise<void> {
    await db
      .delete(schema.activities)
      .where(
        and(
          eq(schema.activities.userId, userId),
          eq(schema.activities.mediaId, mediaId),
          eq(schema.activities.type, type),
        ),
      )
  },

  /**
   * The feed: activity by a set of users, newest first (SPEC 13).
   *
   * Fan-out on read. SPEC 13 rules out ranking for the MVP, so this is a
   * keyset scan over `activities_user_created_idx` with the friend id set --
   * which is exactly what that index is shaped for.
   *
   * `type` narrows it to one kind of event. Applied here rather than by
   * filtering the page afterwards, because a post-filter returns short pages:
   * ask for fifteen ratings, get back the ratings among the last fifteen
   * events, and a friend who wrote three reviews this morning silently costs
   * the reader three rows.
   */
  async listForUsers(
    db: Executor,
    userIds: string[],
    limit: number,
    cursor: Date | null,
    type?: ActivityType,
    blockedUserIds: readonly string[] = [],
  ) {
    if (userIds.length === 0) return []

    const scope = and(
      inArray(schema.activities.userId, userIds),
      type ? eq(schema.activities.type, type) : undefined,
      notBlocked(schema.activities.userId, blockedUserIds),
    )

    return db
      .select({
        activity: schema.activities,
        user: schema.users,
        media: schema.media,
        review: schema.reviews,
        ratingScore: schema.ratings.score,
        list: schema.lists,
      })
      .from(schema.activities)
      .innerJoin(schema.users, eq(schema.users.id, schema.activities.userId))
      .leftJoin(schema.media, eq(schema.media.id, schema.activities.mediaId))
      .leftJoin(schema.reviews, eq(schema.reviews.id, schema.activities.reviewId))
      .leftJoin(schema.ratings, eq(schema.ratings.id, schema.activities.ratingId))
      .leftJoin(schema.lists, eq(schema.lists.id, schema.activities.listId))
      .where(cursor ? and(scope, lt(schema.activities.createdAt, cursor)) : scope)
      .orderBy(desc(schema.activities.createdAt))
      .limit(limit)
  },

  /** A single user's activity, for their profile. */
  async listForUser(db: Executor, userId: string, limit: number, cursor: Date | null) {
    return this.listForUsers(db, [userId], limit, cursor)
  },

  /** Which of these activities the viewer has liked. */
  async findLikedBy(db: Executor, userId: string, activityIds: string[]): Promise<Set<string>> {
    if (activityIds.length === 0) return new Set()
    const rows = await db
      .select({ activityId: schema.activityLikes.activityId })
      .from(schema.activityLikes)
      .where(
        and(
          eq(schema.activityLikes.userId, userId),
          inArray(schema.activityLikes.activityId, activityIds),
        ),
      )
    return new Set(rows.map((row) => row.activityId))
  },

  async like(db: Executor, userId: string, activityId: string): Promise<boolean> {
    const inserted = await db
      .insert(schema.activityLikes)
      .values({ userId, activityId })
      .onConflictDoNothing()
      .returning({ activityId: schema.activityLikes.activityId })

    if (inserted.length === 0) return false

    await db
      .update(schema.activities)
      .set({ likeCount: sql`${schema.activities.likeCount} + 1` })
      .where(eq(schema.activities.id, activityId))

    return true
  },

  async unlike(db: Executor, userId: string, activityId: string): Promise<boolean> {
    const deleted = await db
      .delete(schema.activityLikes)
      .where(
        and(
          eq(schema.activityLikes.userId, userId),
          eq(schema.activityLikes.activityId, activityId),
        ),
      )
      .returning({ activityId: schema.activityLikes.activityId })

    if (deleted.length === 0) return false

    await db
      .update(schema.activities)
      .set({ likeCount: sql`GREATEST(0, ${schema.activities.likeCount} - 1)` })
      .where(eq(schema.activities.id, activityId))

    return true
  },
}
