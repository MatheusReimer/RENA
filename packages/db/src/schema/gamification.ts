import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { mediaTypeEnum } from './enums'
import { users } from './users'

/**
 * Badge catalogue (SPEC 17).
 *
 * Rows are seeded from BADGE_DEFINITIONS in @revy/shared/constants; `slug` is
 * the stable key that links the two. Requirements are stored declaratively so
 * BadgeService evaluates them generically rather than branching per badge --
 * SPEC 17 requires the logic live in a service, not in the UI.
 */
export const badges = pgTable(
  'badges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    icon: text('icon').notNull(),
    requirementType: text('requirement_type').notNull(),
    requirementValue: integer('requirement_value').notNull(),
    /** Narrows a rating_count_of_type requirement to one media type. */
    requirementMediaType: mediaTypeEnum('requirement_media_type'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('badges_requirement_type_idx').on(table.requirementType)],
)

export const userBadges = pgTable(
  'user_badges',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    badgeId: uuid('badge_id')
      .notNull()
      .references(() => badges.id, { onDelete: 'cascade' }),
    earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A badge is earned once. The unique index makes re-award attempts a
    // no-op at the database rather than a duplicate row.
    uniqueIndex('user_badges_pk').on(table.userId, table.badgeId),
    index('user_badges_user_earned_idx').on(table.userId, table.earnedAt),
  ],
)

export const badgesRelations = relations(badges, ({ many }) => ({
  userBadges: many(userBadges),
}))

export const userBadgesRelations = relations(userBadges, ({ one }) => ({
  user: one(users, { fields: [userBadges.userId], references: [users.id] }),
  badge: one(badges, { fields: [userBadges.badgeId], references: [badges.id] }),
}))
