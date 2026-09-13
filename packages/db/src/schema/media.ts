import type { MediaMetadata } from '@revy/shared/types'
import { relations, sql } from 'drizzle-orm'
import {
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { mediaStatusEnum, mediaTypeEnum } from './enums'
import { users } from './users'

/**
 * The generic media entity (SPEC 7).
 *
 * There is exactly one media table for movies, series and books, and every
 * social entity references it. SPEC 49.3 forbids per-type rating systems and
 * SPEC 49.11 requires that new media types are additive -- both hold as long
 * as nothing downstream branches on `media_type` for storage.
 */
export const media = pgTable(
  'media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Identifier within the source provider (e.g. a TMDB id). */
    externalId: text('external_id').notNull(),
    /** Which provider supplied this row; see packages/core/providers. */
    provider: text('provider').notNull(),
    mediaType: mediaTypeEnum('media_type').notNull(),
    title: text('title').notNull(),
    originalTitle: text('original_title'),
    description: text('description'),
    releaseDate: date('release_date'),
    coverImageUrl: text('cover_image_url'),
    backdropImageUrl: text('backdrop_image_url'),
    /** Provider extras (genres, runtime, authors). Shape: MediaMetadata. */
    metadata: jsonb('metadata').$type<MediaMetadata>().notNull().default({}),
    /** When provider data was last refreshed, for background re-sync. */
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per provider item. This is the idempotency key that lets the
    // same search result resolve to the same media row every time.
    uniqueIndex('media_provider_external_id_idx').on(
      table.provider,
      table.externalId,
      table.mediaType,
    ),
    index('media_type_idx').on(table.mediaType),
    // Trigram-friendly title lookup for local search fallback.
    index('media_title_idx').on(table.title),
    index('media_release_date_idx').on(table.releaseDate),
  ],
)

/**
 * Denormalised rating aggregates (SPEC 19, 38).
 *
 * Recomputing AVG() over every rating on each media page view would not
 * survive a popular title. This row is updated inside the same transaction as
 * the rating write, so it is always consistent, never eventually-consistent.
 */
export const mediaRatingStats = pgTable('media_rating_stats', {
  mediaId: uuid('media_id')
    .primaryKey()
    .references(() => media.id, { onDelete: 'cascade' }),
  ratingCount: integer('rating_count').notNull().default(0),
  /** Sum of half-step scores (1..10 each), so average = sum / count / 2. */
  ratingSum: integer('rating_sum').notNull().default(0),
  /** Histogram of half-step score -> count, keyed '1'..'10'. */
  distribution: jsonb('distribution').$type<Record<string, number>>().notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A user's relationship with a media item: status and timestamps (SPEC 9).
 * Ratings live separately because a user can rate without tracking status.
 */
export const userMedia = pgTable(
  'user_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    status: mediaStatusEnum('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    /** Progress hint: episode number for series, page for books. */
    progress: smallint('progress'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A user has at most one status per media item.
    uniqueIndex('user_media_user_media_idx').on(table.userId, table.mediaId),
    index('user_media_media_id_idx').on(table.mediaId),
    // Drives the profile's "Currently watching / reading" section.
    index('user_media_user_status_idx').on(table.userId, table.status, table.updatedAt),
  ],
)

export const mediaRelations = relations(media, ({ one, many }) => ({
  ratingStats: one(mediaRatingStats, {
    fields: [media.id],
    references: [mediaRatingStats.mediaId],
  }),
  userMedia: many(userMedia),
}))

export const userMediaRelations = relations(userMedia, ({ one }) => ({
  user: one(users, { fields: [userMedia.userId], references: [users.id] }),
  media: one(media, { fields: [userMedia.mediaId], references: [media.id] }),
}))

/** Raw SQL helper for computing an average from the aggregate row. */
export const averageFromStats = sql`
  CASE WHEN ${mediaRatingStats.ratingCount} = 0 THEN NULL
       ELSE ${mediaRatingStats.ratingSum}::numeric / ${mediaRatingStats.ratingCount} / 2
  END
`
