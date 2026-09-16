import { relations, sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { authUser } from './auth'

/**
 * The application's user domain (SPEC 6).
 *
 * Deliberately separate from `auth_user`: credentials and sessions belong to
 * Better Auth, while username / bio / avatar belong to the product. Swapping
 * auth providers later means repointing `auth_user_id`, not rewriting the
 * social graph.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * 1:1 link to the auth provider's user record, until the account is deleted.
     *
     * Nullable, and `set null` rather than `cascade`, because deleting an
     * account anonymises this row instead of removing it: the credentials, the
     * sessions and the address go, and the reviews and discussion comments
     * stay under "Deleted account" so threads other people replied to remain
     * readable. Cascading here would take those with it.
     *
     * A null therefore means exactly one thing -- this account was deleted --
     * and `deleted_at` below records when.
     */
    authUserId: text('auth_user_id')
      .unique()
      .references(() => authUser.id, { onDelete: 'set null' }),
    username: text('username').notNull(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    /*
     * The language this person reads and writes in (SPEC 31).
     *
     * Distinct from `reviews.language`, which is a property of one piece of
     * text. This is a property of a person, and it does two jobs: it sets the
     * interface on every device they sign in from, and it is the language
     * their own reviews are recorded as being written in -- so the attribution
     * on a translation ("translated from Portuguese") is sourced from what the
     * author told us rather than guessed from the characters.
     *
     * Defaulted rather than nullable, for the same reason as the review
     * column: everyone has a language, and null would mean "we never asked".
     */
    language: varchar('language', { length: 8 }).notNull().default('en'),
    /*
     * The badge shown beside this person's name, as a slug (SPEC 17).
     *
     * Denormalised onto the user deliberately. The title appears everywhere a
     * name does -- reviews, comments, the feed, presence, friend lists -- and
     * `toUserSummary` is called from forty-two places. Resolving it by join
     * would mean editing forty-two queries and paying for the join on every
     * one; a column on a row those queries already select costs nothing.
     *
     * The slug rather than the badge id, and no name column: the name is
     * rendered from the slug in the reader's own language, so storing it would
     * only create an English copy to go stale.
     *
     * Maintained by `badgeService` when a rarer badge is earned. Null until
     * somebody earns their first.
     */
    titleBadgeSlug: text('title_badge_slug'),
    /**
     * When this account was deleted, or null while it exists.
     *
     * The row stays so that what this person wrote in public can stay too --
     * see `auth_user_id` above. Everything that reads a person rather than a
     * piece of writing filters on this: search, profiles, friend suggestions,
     * the member lists. A deleted account is a name on an old comment, not
     * somebody you can find, follow or message.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Usernames are displayed as typed but must be unique case-insensitively,
    // so "Pedro" cannot be registered alongside "pedro".
    uniqueIndex('users_username_lower_idx').on(sql`lower(${table.username})`),
    index('users_display_name_idx').on(table.displayName),
  ],
)

/**
 * Running XP total (SPEC 16).
 *
 * Kept in its own table rather than a column on `users` so XP writes -- which
 * happen on nearly every action -- do not contend with profile reads.
 */
export const userXp = pgTable('user_xp', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  totalXp: integer('total_xp').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const usersRelations = relations(users, ({ one }) => ({
  authUser: one(authUser, {
    fields: [users.authUserId],
    references: [authUser.id],
  }),
  xp: one(userXp, {
    fields: [users.id],
    references: [userXp.userId],
  }),
}))
