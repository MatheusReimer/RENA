import { relations } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { PersonMetadata } from '@revy/shared/types'
import { creditRoleEnum } from './enums'
import { media } from './media'

/**
 * People in the catalogue: directors, actors, writers, authors, studios.
 *
 * The answer to "what else has this person made", which the catalogue could
 * not express at all: credits were never captured, and the only names anywhere
 * were `metadata.authors` and `metadata.developers` -- free strings on a
 * title, unjoinable, so two books by one author shared nothing a query could
 * find.
 *
 * Deliberately *not* a community (SPEC 14). A title community works because
 * everyone in it consumed the same object and can argue about the same ending;
 * a director has no shared object, so the conversation has nothing to be
 * about. This is a facet of the catalogue -- a way through it -- and the
 * conversation stays on the titles.
 */
export const people = pgTable(
  'people',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Where the identity came from: a provider name, or 'local'.
     *
     * 'local' covers the people we derived from strings we already had --
     * book authors and game developers -- who have no provider id of their
     * own. Their `external_id` is a slug of the name, which is what makes
     * "Colleen Hoover" on two different books resolve to one row.
     */
    provider: text('provider').notNull(),
    externalId: text('external_id').notNull(),
    name: text('name').notNull(),
    imageUrl: text('image_url'),
    metadata: jsonb('metadata').$type<PersonMetadata>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The identity. Import upserts on this, so re-running is idempotent.
    uniqueIndex('people_provider_external_idx').on(table.provider, table.externalId),
    index('people_name_idx').on(table.name),
  ],
)

/**
 * Who worked on what, and as what.
 *
 * `billing` is the provider's own ordering within a role -- TMDB returns cast
 * in credit order, which is the only signal available for "who is actually in
 * this" versus "who is in one scene". Stored rather than re-derived, because
 * it is the provider's editorial judgement and we cannot reconstruct it.
 *
 * Unique on (media, person, role) rather than (media, person): somebody who
 * both wrote and directed a film has two credits on it, and collapsing them
 * would silently drop one.
 */
export const mediaCredits = pgTable(
  'media_credits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    personId: uuid('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: creditRoleEnum('role').notNull(),
    /** Cast only. The part they played. */
    character: text('character'),
    /** Provider ordering within the role; 0 is top billing. */
    billing: integer('billing').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('media_credits_unique_idx').on(table.mediaId, table.personId, table.role),
    // The media page's cast strip: one title, grouped by role, in billing order.
    index('media_credits_media_idx').on(table.mediaId, table.role, table.billing),
    // The person page: everything one person is credited on.
    index('media_credits_person_idx').on(table.personId, table.role),
  ],
)

export const peopleRelations = relations(people, ({ many }) => ({
  credits: many(mediaCredits),
}))

export const mediaCreditsRelations = relations(mediaCredits, ({ one }) => ({
  media: one(media, { fields: [mediaCredits.mediaId], references: [media.id] }),
  person: one(people, { fields: [mediaCredits.personId], references: [people.id] }),
}))
