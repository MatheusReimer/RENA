import { type Executor, schema } from '@revy/db'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { notBlocked } from './filters'

/** Data access for reviews (SPEC 11). */

type ReviewRow = typeof schema.reviews.$inferSelect

export const reviewRepository = {
  async findById(db: Executor, id: string): Promise<ReviewRow | null> {
    const [row] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, id)).limit(1)
    return row ?? null
  },

  async findByUserAndMedia(
    db: Executor,
    userId: string,
    mediaId: string,
  ): Promise<ReviewRow | null> {
    const [row] = await db
      .select()
      .from(schema.reviews)
      .where(and(eq(schema.reviews.userId, userId), eq(schema.reviews.mediaId, mediaId)))
      .limit(1)
    return row ?? null
  },

  async create(
    db: Executor,
    values: typeof schema.reviews.$inferInsert,
  ): Promise<ReviewRow> {
    const [row] = await db.insert(schema.reviews).values(values).returning()
    return row!
  },

  async update(
    db: Executor,
    id: string,
    values: Partial<typeof schema.reviews.$inferInsert>,
  ): Promise<ReviewRow | null> {
    const [row] = await db
      .update(schema.reviews)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.reviews.id, id))
      .returning()
    return row ?? null
  },

  async remove(db: Executor, id: string): Promise<void> {
    await db.delete(schema.reviews).where(eq(schema.reviews.id, id))
  },

  /**
   * Reviews for a media item, newest first, cursor-paginated (SPEC 38).
   *
   * The cursor is the previous page's last `createdAt`. Keyset pagination
   * rather than OFFSET, because OFFSET degrades linearly and silently skips
   * rows when new reviews are written mid-scroll.
   */
  async listForMedia(
    db: Executor,
    mediaId: string,
    limit: number,
    cursor: Date | null,
    blockedUserIds: readonly string[] = [],
  ) {
    const scope = and(
      eq(schema.reviews.mediaId, mediaId),
      notBlocked(schema.reviews.userId, blockedUserIds),
    )

    return db
      .select({
        review: schema.reviews,
        user: schema.users,
        score: schema.ratings.score,
      })
      .from(schema.reviews)
      .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
      .leftJoin(schema.ratings, eq(schema.ratings.id, schema.reviews.ratingId))
      .where(cursor ? and(scope, lt(schema.reviews.createdAt, cursor)) : scope)
      .orderBy(desc(schema.reviews.createdAt))
      .limit(limit)
  },

  /** A user's reviews with their media, for the profile (SPEC 22). */
  async listForUser(db: Executor, userId: string, limit: number, cursor: Date | null) {
    return db
      .select({
        review: schema.reviews,
        user: schema.users,
        media: schema.media,
        score: schema.ratings.score,
      })
      .from(schema.reviews)
      .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
      .innerJoin(schema.media, eq(schema.media.id, schema.reviews.mediaId))
      .leftJoin(schema.ratings, eq(schema.ratings.id, schema.reviews.ratingId))
      .where(
        cursor
          ? and(eq(schema.reviews.userId, userId), lt(schema.reviews.createdAt, cursor))
          : eq(schema.reviews.userId, userId),
      )
      .orderBy(desc(schema.reviews.createdAt))
      .limit(limit)
  },

  async countForMedia(db: Executor, mediaId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.reviews)
      .where(eq(schema.reviews.mediaId, mediaId))
    return row?.total ?? 0
  },

  /* ---------------------------------------------------------------- *
   * Likes
   * ---------------------------------------------------------------- */

  /** Which of these reviews the viewer has liked. Drives the filled heart. */
  async findLikedBy(db: Executor, userId: string, reviewIds: string[]): Promise<Set<string>> {
    if (reviewIds.length === 0) return new Set()
    const rows = await db
      .select({ reviewId: schema.reviewLikes.reviewId })
      .from(schema.reviewLikes)
      .where(
        and(
          eq(schema.reviewLikes.userId, userId),
          inArray(schema.reviewLikes.reviewId, reviewIds),
        ),
      )
    return new Set(rows.map((row) => row.reviewId))
  },

  /**
   * Likes a review. Returns false when the like already existed, so the
   * caller can skip the counter update and the notification.
   */
  async like(db: Executor, userId: string, reviewId: string): Promise<boolean> {
    const inserted = await db
      .insert(schema.reviewLikes)
      .values({ userId, reviewId })
      .onConflictDoNothing()
      .returning({ reviewId: schema.reviewLikes.reviewId })

    if (inserted.length === 0) return false

    await db
      .update(schema.reviews)
      .set({ likeCount: sql`${schema.reviews.likeCount} + 1` })
      .where(eq(schema.reviews.id, reviewId))

    return true
  },

  async unlike(db: Executor, userId: string, reviewId: string): Promise<boolean> {
    const deleted = await db
      .delete(schema.reviewLikes)
      .where(
        and(eq(schema.reviewLikes.userId, userId), eq(schema.reviewLikes.reviewId, reviewId)),
      )
      .returning({ reviewId: schema.reviewLikes.reviewId })

    if (deleted.length === 0) return false

    await db
      .update(schema.reviews)
      // GREATEST guards the counter against ever going negative if a like row
      // is removed twice by a race.
      .set({ likeCount: sql`GREATEST(0, ${schema.reviews.likeCount} - 1)` })
      .where(eq(schema.reviews.id, reviewId))

    return true
  },
}
