import { type Executor, schema } from '@revy/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

/** Data access for community membership (SPEC 14). */

export const communityRepository = {
  /** Joining twice is a no-op; the unique index decides, not a prior read. */
  async join(db: Executor, mediaId: string, userId: string): Promise<boolean> {
    const rows = await db
      .insert(schema.communityMembers)
      .values({ mediaId, userId })
      .onConflictDoNothing()
      .returning({ mediaId: schema.communityMembers.mediaId })
    return rows.length > 0
  },

  async leave(db: Executor, mediaId: string, userId: string): Promise<boolean> {
    const rows = await db
      .delete(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.mediaId, mediaId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .returning({ mediaId: schema.communityMembers.mediaId })
    return rows.length > 0
  },

  async isMember(db: Executor, mediaId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ mediaId: schema.communityMembers.mediaId })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.mediaId, mediaId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1)
    return row !== undefined
  },

  /**
   * Member counts for several communities at once.
   *
   * Counted rather than denormalised, unlike rating aggregates. A community
   * page is not on the hot path the way a media page is, the index covers it,
   * and one fewer denormalised counter is one fewer thing that can drift. If
   * this ever shows up in a slow query log, the fix is the same shape as
   * media_rating_stats.
   */
  async memberCounts(db: Executor, mediaIds: string[]): Promise<Map<string, number>> {
    if (mediaIds.length === 0) return new Map()

    const rows = await db
      .select({
        mediaId: schema.communityMembers.mediaId,
        total: sql<number>`count(*)::int`,
      })
      .from(schema.communityMembers)
      .where(inArray(schema.communityMembers.mediaId, mediaIds))
      .groupBy(schema.communityMembers.mediaId)

    return new Map(rows.map((row) => [row.mediaId, row.total]))
  },

  /** Which of these communities the viewer belongs to. */
  async membershipsFor(
    db: Executor,
    userId: string,
    mediaIds: string[],
  ): Promise<Set<string>> {
    if (mediaIds.length === 0) return new Set()

    const rows = await db
      .select({ mediaId: schema.communityMembers.mediaId })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.userId, userId),
          inArray(schema.communityMembers.mediaId, mediaIds),
        ),
      )
    return new Set(rows.map((row) => row.mediaId))
  },

  async listMembers(db: Executor, mediaId: string, limit: number) {
    return db
      .select({ user: schema.users, joinedAt: schema.communityMembers.joinedAt })
      .from(schema.communityMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.communityMembers.userId))
      .where(eq(schema.communityMembers.mediaId, mediaId))
      .orderBy(desc(schema.communityMembers.joinedAt))
      .limit(limit)
  },

  /** The communities a user has joined, most recent first. */
  async listJoined(db: Executor, userId: string, limit: number) {
    return db
      .select({ media: schema.media, joinedAt: schema.communityMembers.joinedAt })
      .from(schema.communityMembers)
      .innerJoin(schema.media, eq(schema.media.id, schema.communityMembers.mediaId))
      .where(eq(schema.communityMembers.userId, userId))
      .orderBy(desc(schema.communityMembers.joinedAt))
      .limit(limit)
  },

  /**
   * Communities worth showing, ranked by how alive they are.
   *
   * A community exists wherever a discussion does, so this is driven by thread
   * activity rather than by a separate "community" record -- there is nothing
   * to create, and a title becomes a community the moment someone starts
   * talking about it.
   */
  async listActive(db: Executor, limit: number) {
    return db
      .select({
        media: schema.media,
        threadCount: sql<number>`count(${schema.discussionThreads.id})::int`,
        lastActivityAt: sql<Date>`max(${schema.discussionThreads.lastActivityAt})`,
        replyCount: sql<number>`coalesce(sum(${schema.discussionThreads.replyCount}), 0)::int`,
      })
      .from(schema.discussionThreads)
      .innerJoin(schema.media, eq(schema.media.id, schema.discussionThreads.mediaId))
      .groupBy(schema.media.id)
      .orderBy(desc(sql`max(${schema.discussionThreads.lastActivityAt})`))
      .limit(limit)
  },
}
