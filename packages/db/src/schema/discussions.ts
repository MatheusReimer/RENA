import { relations, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { COMMENT_MAX_DEPTH } from '@revy/shared/constants'
import { media } from './media'
import { users } from './users'

/**
 * Media discussion threads (SPEC 14).
 *
 * Every media item is a community. SPEC 14 calls this a core differentiator,
 * and explicitly scopes the MVP to plain request/response -- no realtime.
 */
export const discussionThreads = pgTable(
  'discussion_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    spoiler: boolean('spoiler').notNull().default(false),
    replyCount: integer('reply_count').notNull().default(0),
    /** Bumped on every new comment; drives "most recently active" ordering. */
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discussion_threads_media_id_idx').on(table.mediaId),
    // The community tab's default sort.
    index('discussion_threads_media_activity_idx').on(table.mediaId, table.lastActivityAt),
    index('discussion_threads_user_idx').on(table.userId),
  ],
)

/**
 * Threaded comments (SPEC 14).
 *
 * `parent_comment_id` self-references for nesting, and `depth` is stored
 * rather than computed so the API can enforce COMMENT_MAX_DEPTH with one
 * comparison instead of walking ancestors on every insert.
 */
export const discussionComments = pgTable(
  'discussion_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    threadId: uuid('thread_id')
      .notNull()
      .references(() => discussionThreads.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentCommentId: uuid('parent_comment_id').references(
      (): AnyPgColumn => discussionComments.id,
      { onDelete: 'cascade' },
    ),
    /** Raw text. Escaped at render time, never trusted as HTML (SPEC 39). */
    content: text('content').notNull(),
    spoiler: boolean('spoiler').notNull().default(false),
    /** 0 for top-level. Capped at COMMENT_MAX_DEPTH. */
    depth: smallint('depth').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('discussion_comments_thread_id_idx').on(table.threadId),
    // Fetches one nesting level of a thread in creation order.
    index('discussion_comments_thread_parent_idx').on(
      table.threadId,
      table.parentCommentId,
      table.createdAt,
    ),
    index('discussion_comments_user_idx').on(table.userId),
    check(
      'discussion_comments_depth_range',
      sql`${table.depth} BETWEEN 0 AND ${sql.raw(String(COMMENT_MAX_DEPTH))}`,
    ),
  ],
)

/** Comments on a review, distinct from media discussions (SPEC 23). */
export const reviewComments = pgTable(
  'review_comments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reviewId: uuid('review_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    spoiler: boolean('spoiler').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('review_comments_review_created_idx').on(table.reviewId, table.createdAt),
    index('review_comments_user_idx').on(table.userId),
  ],
)

export const discussionThreadsRelations = relations(discussionThreads, ({ one, many }) => ({
  media: one(media, { fields: [discussionThreads.mediaId], references: [media.id] }),
  user: one(users, { fields: [discussionThreads.userId], references: [users.id] }),
  comments: many(discussionComments),
}))

export const discussionCommentsRelations = relations(discussionComments, ({ one, many }) => ({
  thread: one(discussionThreads, {
    fields: [discussionComments.threadId],
    references: [discussionThreads.id],
  }),
  user: one(users, { fields: [discussionComments.userId], references: [users.id] }),
  parent: one(discussionComments, {
    fields: [discussionComments.parentCommentId],
    references: [discussionComments.id],
    relationName: 'comment_parent',
  }),
  replies: many(discussionComments, { relationName: 'comment_parent' }),
}))
