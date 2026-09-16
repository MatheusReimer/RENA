import { relations } from 'drizzle-orm'
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import { reportReasonEnum, reportStatusEnum, reportTargetEnum } from './enums'
import { users } from './users'

/**
 * Blocking (App Store guideline 1.2, Play's user-generated content policy).
 *
 * One row per direction, rather than the unordered pair `friendships` uses.
 * The pair is right there because a friendship is one relationship however it
 * started; a block is not. A blocks B and B blocks A are two separate acts,
 * and unblocking has to undo only the one the person performing it made.
 *
 * What the row means is mutual invisibility: neither sees the other's reviews,
 * comments, feed entries, profile or search results, and neither can message
 * or friend the other. That is stronger than hiding one direction, and it is
 * the behaviour somebody blocking a harasser expects -- a block that leaves
 * your writing in front of them is not protection.
 */
export const userBlocks = pgTable(
  'user_blocks',
  {
    blockerId: uuid('blocker_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    blockedId: uuid('blocked_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.blockerId, table.blockedId] }),
    /*
     * Read in both directions on every request that renders somebody else's
     * writing: "who have I blocked" and "who has blocked me" are the same
     * question to a viewer, and the primary key only indexes the first.
     */
    index('user_blocks_blocked_idx').on(table.blockedId),
    check('user_blocks_no_self', sql`${table.blockerId} <> ${table.blockedId}`),
  ],
)

/**
 * Reports of content or of a person.
 *
 * Kept as rows rather than only mailed, because the guideline asks for action
 * within 24 hours of a report and "we emailed somebody" is not a record of
 * whether that happened. `status` is that record.
 *
 * `targetId` is deliberately a bare uuid with no foreign key: it points at a
 * review, a comment, a thread, a message, a list or a user depending on
 * `targetType`, and a constraint can only name one of those. The trade is that
 * a report can outlive what it points at, which is the right way round -- the
 * row is evidence of a decision, and deleting the content should not erase it.
 */
export const contentReports = pgTable(
  'content_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /*
     * Null once the reporter deletes their account. The report survives them:
     * it is about the content, and dropping it would let somebody clear their
     * record by deleting an account and making a new one.
     */
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    targetType: reportTargetEnum('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    /** Who wrote the reported thing, resolved when the report is filed. */
    reportedUserId: uuid('reported_user_id').references(() => users.id, { onDelete: 'set null' }),
    reason: reportReasonEnum('reason').notNull(),
    /** What the reporter added in their own words. */
    note: text('note'),
    status: reportStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    // The queue: open reports, oldest first, is the only read that matters.
    index('content_reports_status_idx').on(table.status, table.createdAt),
    index('content_reports_target_idx').on(table.targetType, table.targetId),
    /*
     * One report per person per thing. Without this, a report button is a way
     * to fill somebody's inbox, and the second report from the same reader
     * adds nothing a moderator can act on.
     */
    index('content_reports_reporter_idx').on(table.reporterId, table.targetType, table.targetId),
  ],
)

export const userBlocksRelations = relations(userBlocks, ({ one }) => ({
  blocker: one(users, {
    fields: [userBlocks.blockerId],
    references: [users.id],
    relationName: 'block_blocker',
  }),
  blocked: one(users, {
    fields: [userBlocks.blockedId],
    references: [users.id],
    relationName: 'block_blocked',
  }),
}))

export const contentReportsRelations = relations(contentReports, ({ one }) => ({
  reporter: one(users, {
    fields: [contentReports.reporterId],
    references: [users.id],
    relationName: 'report_reporter',
  }),
  reportedUser: one(users, {
    fields: [contentReports.reportedUserId],
    references: [users.id],
    relationName: 'report_reported',
  }),
}))
