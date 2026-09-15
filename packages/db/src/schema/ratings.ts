import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { media } from './media'
import { users } from './users'

/**
 * Ratings (SPEC 10).
 *
 * `score` is stored as an integer count of half-steps (1..10 == 0.5..5.0).
 * Floats would make equality checks and AVG() subtly unreliable; the
 * conversion lives in @revy/shared/utils (toScore / toHalfSteps) and happens
 * only at the domain boundary.
 */
export const ratings = pgTable(
  'ratings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    score: smallint('score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // SPEC 10: one active rating per user per media. Re-rating updates in
    // place; this constraint is what makes the upsert safe under concurrency.
    uniqueIndex('ratings_user_media_idx').on(table.userId, table.mediaId),
    index('ratings_user_id_idx').on(table.userId),
    index('ratings_media_id_idx').on(table.mediaId),
    index('ratings_user_created_idx').on(table.userId, table.createdAt),
    // Defence in depth: the DB rejects an out-of-range score even if a future
    // code path forgets to validate (SPEC 39).
    check('ratings_score_range', sql`${table.score} BETWEEN 1 AND 10`),
  ],
)

/**
 * Reviews (SPEC 11).
 *
 * A review may carry a rating, referenced rather than duplicated so editing
 * the rating in one place updates both surfaces.
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    /** Null when the author reviewed without scoring. */
    ratingId: uuid('rating_id').references(() => ratings.id, { onDelete: 'set null' }),
    /** Stored raw and escaped at render time. Never trusted as HTML (SPEC 39). */
    content: text('content').notNull(),
    /*
     * What language this was written in.
     *
     * Not a display preference -- a property of the text. Somebody who buys a
     * book in Sao Paulo and finds forty reviews of it has technically found
     * company and practically found none if every one of them is in English.
     * Language is part of presence, which is why it lives on the review rather
     * than being inferred from whoever happens to be reading it.
     *
     * A short BCP-47 tag ('en', 'pt-BR'), defaulted rather than nullable: every
     * review has a language, and a null here would mean "we forgot to ask".
     */
    language: varchar('language', { length: 8 }).notNull().default('en'),
    spoiler: boolean('spoiler').notNull().default(false),
    /** Denormalised counters, maintained transactionally with the writes. */
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One review per user per media keeps the media page coherent; edits
    // update the existing row.
    uniqueIndex('reviews_user_media_idx').on(table.userId, table.mediaId),
    index('reviews_user_id_idx').on(table.userId),
    index('reviews_media_id_idx').on(table.mediaId),
    index('reviews_media_created_idx').on(table.mediaId, table.createdAt),
  ],
)

/**
 * Machine translations of a review, cached (SPEC 31, 40).
 *
 * A separate table rather than a column on `reviews`, and the reason is what
 * the two things are. The review is what somebody wrote. These are derived
 * artefacts of it -- produced by a model, never edited by a person, disposable
 * and rebuildable. Keeping them apart means a translation can be deleted or
 * regenerated wholesale without touching a row anybody authored, and it keeps
 * the review table the same size it was for every query that does not want a
 * translation.
 *
 * Filled lazily: a translation is produced the first time somebody who reads
 * another language opens the review, then kept. Translating every review into
 * every language on write would spend most of its cost on text nobody asks
 * for, and this catalogue has more reviews than readers of any one language.
 */
export const reviewTranslations = pgTable(
  'review_translations',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    /** The language this row is *into*. The source is on the review. */
    language: varchar('language', { length: 8 }).notNull(),
    content: text('content').notNull(),
    /**
     * Which model produced it.
     *
     * Recorded so a batch from a model that turned out to translate badly can
     * be found and dropped without invalidating every translation ever made.
     */
    provider: text('provider').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One translation per review per language; a regeneration replaces it.
    uniqueIndex('review_translations_pk').on(table.reviewId, table.language),
  ],
)

/** Likes on reviews, powering the heart counter in the feed. */
export const reviewLikes = pgTable(
  'review_likes',
  {
    reviewId: uuid('review_id')
      .notNull()
      .references(() => reviews.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('review_likes_pk').on(table.reviewId, table.userId),
    index('review_likes_user_idx').on(table.userId),
  ],
)

export const ratingsRelations = relations(ratings, ({ one }) => ({
  user: one(users, { fields: [ratings.userId], references: [users.id] }),
  media: one(media, { fields: [ratings.mediaId], references: [media.id] }),
}))

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  user: one(users, { fields: [reviews.userId], references: [users.id] }),
  media: one(media, { fields: [reviews.mediaId], references: [media.id] }),
  rating: one(ratings, { fields: [reviews.ratingId], references: [ratings.id] }),
  likes: many(reviewLikes),
}))
