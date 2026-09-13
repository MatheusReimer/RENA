import { type Executor, schema } from '@revy/db'
import { and, desc, eq, inArray } from 'drizzle-orm'

/** Data access for ratings and the per-user media status (SPEC 9, 10). */

type RatingRow = typeof schema.ratings.$inferSelect
type UserMediaRow = typeof schema.userMedia.$inferSelect

export const ratingRepository = {
  async find(db: Executor, userId: string, mediaId: string): Promise<RatingRow | null> {
    const [row] = await db
      .select()
      .from(schema.ratings)
      .where(and(eq(schema.ratings.userId, userId), eq(schema.ratings.mediaId, mediaId)))
      .limit(1)
    return row ?? null
  },

  async findById(db: Executor, id: string): Promise<RatingRow | null> {
    const [row] = await db.select().from(schema.ratings).where(eq(schema.ratings.id, id)).limit(1)
    return row ?? null
  },

  /**
   * Creates or updates the user's single rating for a media item (SPEC 10).
   *
   * ON CONFLICT against the (user_id, media_id) unique index makes re-rating
   * an update in place, which is exactly what SPEC 10 requires and what stops
   * a double-tap from producing two rows.
   */
  async upsert(
    db: Executor,
    userId: string,
    mediaId: string,
    halfSteps: number,
  ): Promise<RatingRow> {
    const [row] = await db
      .insert(schema.ratings)
      .values({ userId, mediaId, score: halfSteps })
      .onConflictDoUpdate({
        target: [schema.ratings.userId, schema.ratings.mediaId],
        set: { score: halfSteps, updatedAt: new Date() },
      })
      .returning()
    return row!
  },

  async remove(db: Executor, userId: string, mediaId: string): Promise<RatingRow | null> {
    const [row] = await db
      .delete(schema.ratings)
      .where(and(eq(schema.ratings.userId, userId), eq(schema.ratings.mediaId, mediaId)))
      .returning()
    return row ?? null
  },

  /** The viewer's ratings for a set of media, for feed and list surfaces. */
  async findManyForUser(db: Executor, userId: string, mediaIds: string[]): Promise<RatingRow[]> {
    if (mediaIds.length === 0) return []
    return db
      .select()
      .from(schema.ratings)
      .where(and(eq(schema.ratings.userId, userId), inArray(schema.ratings.mediaId, mediaIds)))
  },

  /**
   * Friends' ratings for one media item (SPEC 19).
   *
   * Takes the friend ids rather than deriving them, so the friendship query
   * happens once per request instead of once per media item.
   */
  async findByUsersForMedia(db: Executor, userIds: string[], mediaId: string) {
    if (userIds.length === 0) return []
    return db
      .select({
        rating: schema.ratings,
        user: schema.users,
        status: schema.userMedia.status,
      })
      .from(schema.ratings)
      .innerJoin(schema.users, eq(schema.users.id, schema.ratings.userId))
      .leftJoin(
        schema.userMedia,
        and(
          eq(schema.userMedia.userId, schema.ratings.userId),
          eq(schema.userMedia.mediaId, mediaId),
        ),
      )
      .where(and(eq(schema.ratings.mediaId, mediaId), inArray(schema.ratings.userId, userIds)))
      .orderBy(desc(schema.ratings.score))
  },

  /* ---------------------------------------------------------------- *
   * Consumption status (SPEC 9)
   * ---------------------------------------------------------------- */

  async findStatus(db: Executor, userId: string, mediaId: string): Promise<UserMediaRow | null> {
    const [row] = await db
      .select()
      .from(schema.userMedia)
      .where(and(eq(schema.userMedia.userId, userId), eq(schema.userMedia.mediaId, mediaId)))
      .limit(1)
    return row ?? null
  },

  async setStatus(
    db: Executor,
    userId: string,
    mediaId: string,
    status: UserMediaRow['status'],
    timestamps: { startedAt?: Date | null; completedAt?: Date | null },
  ): Promise<UserMediaRow> {
    const [row] = await db
      .insert(schema.userMedia)
      .values({
        userId,
        mediaId,
        status,
        startedAt: timestamps.startedAt ?? null,
        completedAt: timestamps.completedAt ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.userMedia.userId, schema.userMedia.mediaId],
        set: {
          status,
          ...(timestamps.startedAt !== undefined ? { startedAt: timestamps.startedAt } : {}),
          ...(timestamps.completedAt !== undefined ? { completedAt: timestamps.completedAt } : {}),
          updatedAt: new Date(),
        },
      })
      .returning()
    return row!
  },

  async clearStatus(db: Executor, userId: string, mediaId: string): Promise<void> {
    await db
      .delete(schema.userMedia)
      .where(and(eq(schema.userMedia.userId, userId), eq(schema.userMedia.mediaId, mediaId)))
  },
}
