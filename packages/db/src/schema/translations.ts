import { relations } from 'drizzle-orm'
import { index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { media } from './media'

/**
 * Catalogue text in the languages the interface speaks.
 *
 * The `media` row holds the title and description as the provider's default --
 * English, in practice -- and the interface has been serving those to everyone
 * regardless of locale. A Portuguese reader got a Portuguese sidebar over
 * "The Dark Knight" and an English plot summary, which is most of the way to
 * not being translated at all.
 *
 * Stored rather than translated on demand for two reasons. Films have official
 * release titles that are not translations: TMDB returns "Batman: O Cavaleiro
 * das Trevas" for pt-BR, which is what the film is actually called in Brazil
 * and what somebody would search for -- no translator, machine or otherwise,
 * would produce it from "The Dark Knight". And a catalogue read is on the hot
 * path of every screen, which is nowhere to put a network call.
 *
 * `source` records where the text came from, because the two kinds are not
 * equivalent and the interface may want to say so: a provider's own
 * translation is editorial, a machine translation is a best effort.
 */
export const mediaTranslations = pgTable(
  'media_translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    /** BCP-47 as the interface uses it: 'pt-BR', 'es'. */
    language: varchar('language', { length: 8 }).notNull(),
    /**
     * The release title in this language.
     *
     * Null where the provider has a description but no distinct title -- which
     * is common, because plenty of films keep their original name. Falling
     * back to the row's own title is then correct, not a gap.
     */
    title: text('title'),
    description: text('description'),
    /** 'tmdb' for an editorial translation, 'gemini' for a machine one. */
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One row per title per language; the backfill upserts on this.
    uniqueIndex('media_translations_unique_idx').on(table.mediaId, table.language),
    // The read path: many ids, one language, every request.
    index('media_translations_lookup_idx').on(table.language, table.mediaId),
  ],
)

export const mediaTranslationsRelations = relations(mediaTranslations, ({ one }) => ({
  media: one(media, { fields: [mediaTranslations.mediaId], references: [media.id] }),
}))
