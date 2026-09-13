import { type Executor, schema } from '@revy/db'
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm'

/** Data access for media discussions (SPEC 14). */

type ThreadRow = typeof schema.discussionThreads.$inferSelect
type CommentRow = typeof schema.discussionComments.$inferSelect

export const discussionRepository = {
  /* ---------------------------------------------------------------- *
   * Threads
   * ---------------------------------------------------------------- */

  async findThreadById(db: Executor, id: string): Promise<ThreadRow | null> {
    const [row] = await db
      .select()
      .from(schema.discussionThreads)
      .where(eq(schema.discussionThreads.id, id))
      .limit(1)
    return row ?? null
  },

  /** A thread with its author and media, for the thread page header. */
  async findThreadWithContext(db: Executor, id: string) {
    const [row] = await db
      .select({
        thread: schema.discussionThreads,
        user: schema.users,
        media: schema.media,
      })
      .from(schema.discussionThreads)
      .innerJoin(schema.users, eq(schema.users.id, schema.discussionThreads.userId))
      .innerJoin(schema.media, eq(schema.media.id, schema.discussionThreads.mediaId))
      .where(eq(schema.discussionThreads.id, id))
      .limit(1)
    return row ?? null
  },

  async createThread(
    db: Executor,
    values: typeof schema.discussionThreads.$inferInsert,
  ): Promise<ThreadRow> {
    const [row] = await db.insert(schema.discussionThreads).values(values).returning()
    return row!
  },

  async removeThread(db: Executor, id: string): Promise<void> {
    await db.delete(schema.discussionThreads).where(eq(schema.discussionThreads.id, id))
  },

  /**
   * Threads for a media item, most recently active first (SPEC 14).
   *
   * Ordered by `last_activity_at` rather than creation: a two-week-old thread
   * that people are still arguing in is the one worth surfacing. Keyset
   * paginated on the same column the index is built for.
   */
  async listThreadsForMedia(
    db: Executor,
    mediaId: string,
    limit: number,
    cursor: Date | null,
  ) {
    const scope = eq(schema.discussionThreads.mediaId, mediaId)

    return db
      .select({
        thread: schema.discussionThreads,
        user: schema.users,
      })
      .from(schema.discussionThreads)
      .innerJoin(schema.users, eq(schema.users.id, schema.discussionThreads.userId))
      .where(
        cursor ? and(scope, lt(schema.discussionThreads.lastActivityAt, cursor)) : scope,
      )
      .orderBy(desc(schema.discussionThreads.lastActivityAt))
      .limit(limit)
  },

  async countThreadsForMedia(db: Executor, mediaId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.discussionThreads)
      .where(eq(schema.discussionThreads.mediaId, mediaId))
    return row?.total ?? 0
  },

  /** Thread counts for several media at once, for list and card surfaces. */
  async countThreadsForManyMedia(
    db: Executor,
    mediaIds: string[],
  ): Promise<Map<string, number>> {
    if (mediaIds.length === 0) return new Map()

    const rows = await db
      .select({
        mediaId: schema.discussionThreads.mediaId,
        total: sql<number>`count(*)::int`,
      })
      .from(schema.discussionThreads)
      .where(inArray(schema.discussionThreads.mediaId, mediaIds))
      .groupBy(schema.discussionThreads.mediaId)

    return new Map(rows.map((row) => [row.mediaId, row.total]))
  },

  /* ---------------------------------------------------------------- *
   * Comments
   * ---------------------------------------------------------------- */

  async findCommentById(db: Executor, id: string): Promise<CommentRow | null> {
    const [row] = await db
      .select()
      .from(schema.discussionComments)
      .where(eq(schema.discussionComments.id, id))
      .limit(1)
    return row ?? null
  },

  async createComment(
    db: Executor,
    values: typeof schema.discussionComments.$inferInsert,
  ): Promise<CommentRow> {
    const [row] = await db.insert(schema.discussionComments).values(values).returning()
    return row!
  },

  async removeComment(db: Executor, id: string): Promise<void> {
    await db.delete(schema.discussionComments).where(eq(schema.discussionComments.id, id))
  },

  /**
   * Every comment in a thread, oldest first.
   *
   * Loaded flat in one query and assembled into a tree in the service. The
   * alternative -- one query per nesting level -- is N+1 in disguise, and a
   * thread deep enough to matter is exactly where that hurts. A recursive CTE
   * would work too, but at MVP thread sizes it buys nothing over sorting a few
   * hundred rows in memory.
   */
  async listCommentsForThread(db: Executor, threadId: string, limit: number) {
    return db
      .select({
        comment: schema.discussionComments,
        user: schema.users,
      })
      .from(schema.discussionComments)
      .innerJoin(schema.users, eq(schema.users.id, schema.discussionComments.userId))
      .where(eq(schema.discussionComments.threadId, threadId))
      .orderBy(asc(schema.discussionComments.createdAt))
      .limit(limit)
  },

  /**
   * Records a new reply on the thread: bumps the counter and the activity
   * timestamp in one statement, so ordering and counts cannot drift apart.
   */
  async recordReply(db: Executor, threadId: string, at: Date): Promise<void> {
    await db
      .update(schema.discussionThreads)
      .set({
        replyCount: sql`${schema.discussionThreads.replyCount} + 1`,
        lastActivityAt: at,
        updatedAt: at,
      })
      .where(eq(schema.discussionThreads.id, threadId))
  },

  /** Increments a parent comment's reply counter. */
  async incrementCommentReplies(db: Executor, commentId: string): Promise<void> {
    await db
      .update(schema.discussionComments)
      .set({ replyCount: sql`${schema.discussionComments.replyCount} + 1` })
      .where(eq(schema.discussionComments.id, commentId))
  },
}
