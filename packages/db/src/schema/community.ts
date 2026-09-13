import { relations } from 'drizzle-orm'
import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { media } from './media'
import { users } from './users'

/**
 * Community membership (SPEC 14).
 *
 * SPEC 14 makes every media item a community; this is the part that was
 * missing -- joining one. A membership is what turns "a page with a comment
 * section" into somewhere you belong, and it is what the Community screen
 * lists.
 *
 * Deliberately minimal: joining is not a role or a subscription, it is a row.
 * Moderation and notification preferences can hang off this later without
 * changing what exists.
 */
export const communityMembers = pgTable(
  'community_members',
  {
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Joining twice is a no-op rather than a second row, decided by the
    // database rather than a read-then-write check that would race.
    uniqueIndex('community_members_pk').on(table.mediaId, table.userId),
    // "Which communities am I in", for the Community screen.
    index('community_members_user_idx').on(table.userId, table.joinedAt),
    // "Who is in this community", and the member count.
    index('community_members_media_idx').on(table.mediaId, table.joinedAt),
  ],
)

export const communityMembersRelations = relations(communityMembers, ({ one }) => ({
  media: one(media, { fields: [communityMembers.mediaId], references: [media.id] }),
  user: one(users, { fields: [communityMembers.userId], references: [users.id] }),
}))
