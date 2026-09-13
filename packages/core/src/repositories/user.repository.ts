import { type Executor, schema } from '@revy/db'
import { and, count, eq, ilike, inArray, or, sql } from 'drizzle-orm'

/** Data access for the user domain (SPEC 6, 22). */

type UserRow = typeof schema.users.$inferSelect

export const userRepository = {
  async findById(db: Executor, id: string): Promise<UserRow | null> {
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)
    return row ?? null
  },

  async findManyByIds(db: Executor, ids: string[]): Promise<UserRow[]> {
    if (ids.length === 0) return []
    return db.select().from(schema.users).where(inArray(schema.users.id, ids))
  },

  /** Username lookup is case-insensitive, matching the unique index. */
  async findByUsername(db: Executor, username: string): Promise<UserRow | null> {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(sql`lower(${schema.users.username}) = lower(${username})`)
      .limit(1)
    return row ?? null
  },

  /** Resolves the auth provider's user id to the domain user (SPEC 26). */
  async findByAuthUserId(db: Executor, authUserId: string): Promise<UserRow | null> {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.authUserId, authUserId))
      .limit(1)
    return row ?? null
  },

  async usernameExists(db: Executor, username: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.username}) = lower(${username})`)
      .limit(1)
    return row !== undefined
  },

  async create(
    db: Executor,
    values: typeof schema.users.$inferInsert,
  ): Promise<UserRow> {
    const [row] = await db.insert(schema.users).values(values).returning()
    return row!
  },

  async update(
    db: Executor,
    id: string,
    values: Partial<typeof schema.users.$inferInsert>,
  ): Promise<UserRow | null> {
    const [row] = await db
      .update(schema.users)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.users.id, id))
      .returning()
    return row ?? null
  },

  /** People search for the search screen's People tab (SPEC 20). */
  async search(db: Executor, query: string, limit: number): Promise<UserRow[]> {
    const pattern = `%${query}%`
    return db
      .select()
      .from(schema.users)
      .where(or(ilike(schema.users.username, pattern), ilike(schema.users.displayName, pattern)))
      .limit(limit)
  },

  /**
   * Profile counters in one round trip (SPEC 22).
   *
   * Four correlated subqueries beat four separate queries here: the profile
   * header needs all of them together and none is expensive on its own given
   * the per-user indexes.
   */
  async getStats(db: Executor, userId: string) {
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
        friendCount: sql<number>`(
          SELECT count(*)::int FROM ${schema.friendships}
          WHERE ${schema.friendships.status} = 'accepted'
            AND (${schema.friendships.requesterId} = ${userId}
                 OR ${schema.friendships.receiverId} = ${userId})
        )`,
        listCount: sql<number>`(
          SELECT count(*)::int FROM ${schema.lists}
          WHERE ${schema.lists.userId} = ${userId}
        )`,
      })
      .from(sql`(SELECT 1) AS placeholder`)

    return row ?? { ratingCount: 0, reviewCount: 0, friendCount: 0, listCount: 0 }
  },

  /** Ratings split by media type, for the profile breakdown (SPEC 22). */
  async getRatingsByType(db: Executor, userId: string) {
    return db
      .select({
        mediaType: schema.media.mediaType,
        total: count(schema.ratings.id),
      })
      .from(schema.ratings)
      .innerJoin(schema.media, eq(schema.media.id, schema.ratings.mediaId))
      .where(eq(schema.ratings.userId, userId))
      .groupBy(schema.media.mediaType)
  },

  /* ---------------------------------------------------------------- *
   * XP (SPEC 16)
   * ---------------------------------------------------------------- */

  async getXp(db: Executor, userId: string): Promise<number> {
    const [row] = await db
      .select({ totalXp: schema.userXp.totalXp })
      .from(schema.userXp)
      .where(eq(schema.userXp.userId, userId))
      .limit(1)
    return row?.totalXp ?? 0
  },

  /** Atomic increment, so two concurrent awards cannot overwrite each other. */
  async addXp(db: Executor, userId: string, amount: number): Promise<void> {
    if (amount === 0) return
    await db
      .insert(schema.userXp)
      .values({ userId, totalXp: amount })
      .onConflictDoUpdate({
        target: schema.userXp.userId,
        set: {
          totalXp: sql`${schema.userXp.totalXp} + ${amount}`,
          updatedAt: new Date(),
        },
      })
  },

  /** 'Currently watching / reading' for the profile (SPEC 22). */
  async getCurrentlyConsuming(db: Executor, userId: string, limit: number) {
    return db
      .select({
        userMedia: schema.userMedia,
        media: schema.media,
      })
      .from(schema.userMedia)
      .innerJoin(schema.media, eq(schema.media.id, schema.userMedia.mediaId))
      .where(
        and(
          eq(schema.userMedia.userId, userId),
          inArray(schema.userMedia.status, ['in_progress', 'planned']),
        ),
      )
      .orderBy(sql`${schema.userMedia.updatedAt} DESC`)
      .limit(limit)
  },
}
