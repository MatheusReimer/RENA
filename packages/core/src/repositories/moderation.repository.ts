import { type Executor, schema } from '@revy/db'
import type { ReportReason, ReportTarget } from '@revy/shared/constants'
import { and, desc, eq, or, sql } from 'drizzle-orm'

/** Data access for blocking and reporting. */

export const moderationRepository = {
  /**
   * Everyone the viewer cannot see and who cannot see them.
   *
   * Both directions in one query, because to a reader they are the same thing:
   * somebody they blocked and somebody who blocked them are equally absent.
   * Returned as a plain array of ids so callers can hand it straight to a
   * `NOT IN`, and empty for a signed-out reader, who has blocked nobody.
   */
  async blockedIds(db: Executor, viewerId: string | null): Promise<string[]> {
    if (!viewerId) return []

    const rows = await db
      .select({
        blockerId: schema.userBlocks.blockerId,
        blockedId: schema.userBlocks.blockedId,
      })
      .from(schema.userBlocks)
      .where(
        or(
          eq(schema.userBlocks.blockerId, viewerId),
          eq(schema.userBlocks.blockedId, viewerId),
        ),
      )

    return rows.map((row) => (row.blockerId === viewerId ? row.blockedId : row.blockerId))
  },

  /** True when either has blocked the other. */
  async isBlockedBetween(db: Executor, a: string, b: string): Promise<boolean> {
    const [row] = await db
      .select({ blockerId: schema.userBlocks.blockerId })
      .from(schema.userBlocks)
      .where(
        or(
          and(eq(schema.userBlocks.blockerId, a), eq(schema.userBlocks.blockedId, b)),
          and(eq(schema.userBlocks.blockerId, b), eq(schema.userBlocks.blockedId, a)),
        ),
      )
      .limit(1)
    return row !== undefined
  },

  /** True when the viewer is the one who blocked, which is what can be undone. */
  async hasBlocked(db: Executor, blockerId: string, blockedId: string): Promise<boolean> {
    const [row] = await db
      .select({ blockerId: schema.userBlocks.blockerId })
      .from(schema.userBlocks)
      .where(
        and(
          eq(schema.userBlocks.blockerId, blockerId),
          eq(schema.userBlocks.blockedId, blockedId),
        ),
      )
      .limit(1)
    return row !== undefined
  },

  /** Idempotent: blocking twice is the same as blocking once. */
  async block(db: Executor, blockerId: string, blockedId: string): Promise<void> {
    await db
      .insert(schema.userBlocks)
      .values({ blockerId, blockedId })
      .onConflictDoNothing()
  },

  async unblock(db: Executor, blockerId: string, blockedId: string): Promise<void> {
    await db
      .delete(schema.userBlocks)
      .where(
        and(
          eq(schema.userBlocks.blockerId, blockerId),
          eq(schema.userBlocks.blockedId, blockedId),
        ),
      )
  },

  /** Who the viewer has blocked, newest first, for the list they can undo from. */
  async listBlocked(db: Executor, blockerId: string) {
    return db
      .select({
        user: schema.users,
        createdAt: schema.userBlocks.createdAt,
      })
      .from(schema.userBlocks)
      .innerJoin(schema.users, eq(schema.users.id, schema.userBlocks.blockedId))
      .where(eq(schema.userBlocks.blockerId, blockerId))
      .orderBy(desc(schema.userBlocks.createdAt))
  },

  /**
   * Files a report, or returns null when this reader already reported this.
   *
   * The second report from the same person adds nothing a moderator can act
   * on, and without this the button is a way to fill an inbox.
   */
  async createReport(
    db: Executor,
    values: {
      reporterId: string
      targetType: ReportTarget
      targetId: string
      reportedUserId: string | null
      reason: ReportReason
      note: string | null
    },
  ): Promise<{ id: string } | null> {
    const [existing] = await db
      .select({ id: schema.contentReports.id })
      .from(schema.contentReports)
      .where(
        and(
          eq(schema.contentReports.reporterId, values.reporterId),
          eq(schema.contentReports.targetType, values.targetType),
          eq(schema.contentReports.targetId, values.targetId),
        ),
      )
      .limit(1)

    if (existing) return null

    const [row] = await db
      .insert(schema.contentReports)
      .values(values)
      .returning({ id: schema.contentReports.id })

    return row ?? null
  },

  /** How many reports are waiting, for the mail that says so. */
  async openReportCount(db: Executor): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.contentReports)
      .where(eq(schema.contentReports.status, 'open'))
    return row?.total ?? 0
  },
}
