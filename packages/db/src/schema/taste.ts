import { relations } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { mediaTypeEnum } from './enums'
import { users } from './users'

/**
 * What a reader told us they like, before they had told us anything (SPEC 21).
 *
 * The cold-start problem, stated plainly: the recommender ranks a title by
 * finding readers whose ratings overlap with yours, and a reader with no
 * ratings overlaps with nobody. Every personalised surface therefore degrades
 * to "what is popular" for exactly the people who most need a reason to come
 * back. Asking four questions at signup is the cheapest way out of it.
 *
 * Stored as moods rather than genres, deliberately. `MOODS` already maps an
 * editorial question to the genre names each provider actually uses -- TMDB's
 * "Science Fiction" for film and "Sci-Fi & Fantasy" for television, IGDB's
 * "Role-playing (RPG)" -- and Explore already reads it, in three languages. A
 * second genre taxonomy here would be the same decisions made twice, drifting
 * from the day it shipped.
 *
 * The row is written once the reader finishes *or* skips, so its presence
 * answers "have we asked this person yet" without a second column. What it
 * does not do is gate anything: the ratings collected during onboarding are
 * ordinary rows in `ratings`, which is what makes them useful to a recommender
 * that has never heard of this table.
 */
export const userTaste = pgTable('user_taste', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Which of the four kinds they care about. Empty means they skipped. */
  mediaTypes: mediaTypeEnum('media_types').array().notNull().default([]),
  /** `MOODS` keys. Text, not an enum: moods are editorial and change. */
  moodKeys: text('mood_keys').array().notNull().default([]),
  /**
   * Whether they dismissed it rather than answered.
   *
   * Worth recording separately from "no selections". A reader who skipped
   * should be asked again later; one who genuinely picked nothing and pressed
   * on has answered, and asking twice would be a bug they experience as
   * nagging.
   */
  skipped: boolean('skipped').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const userTasteRelations = relations(userTaste, ({ one }) => ({
  user: one(users, { fields: [userTaste.userId], references: [users.id] }),
}))
