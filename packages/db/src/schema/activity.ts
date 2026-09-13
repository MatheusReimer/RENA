import type { NotificationContext } from '@revy/shared/types'
import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { activityTypeEnum, notificationTypeEnum } from './enums'
import { lists } from './lists'
import { media } from './media'
import { ratings, reviews } from './ratings'
import { users } from './users'

/**
 * Activity feed events (SPEC 13).
 *
 * Written on the fan-out-on-read model: one row per action by the actor, and
 * the feed query gathers rows from the viewer's friends. SPEC 13 explicitly
 * rules out a recommendation algorithm for the MVP, so chronological ordering
 * over a friend-id set is all this needs to support.
 *
 * If the friend graph ever grows past what a fan-out-on-read query can serve,
 * the replacement is a per-user timeline table -- this schema does not block
 * that, because nothing outside ActivityService reads these rows.
 */
export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: activityTypeEnum('type').notNull(),
    mediaId: uuid('media_id').references(() => media.id, { onDelete: 'cascade' }),
    reviewId: uuid('review_id').references(() => reviews.id, { onDelete: 'cascade' }),
    ratingId: uuid('rating_id').references(() => ratings.id, { onDelete: 'cascade' }),
    listId: uuid('list_id').references(() => lists.id, { onDelete: 'cascade' }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    likeCount: integer('like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('activities_user_id_idx').on(table.userId),
    index('activities_created_at_idx').on(table.createdAt),
    // The feed's actual access path: "rows by these users, newest first".
    index('activities_user_created_idx').on(table.userId, table.createdAt),
    index('activities_media_idx').on(table.mediaId),
  ],
)

/** Likes on feed activities. */
export const activityLikes = pgTable(
  'activity_likes',
  {
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('activity_likes_pk').on(table.activityId, table.userId),
    index('activity_likes_user_idx').on(table.userId),
  ],
)

/**
 * Notifications (SPEC 23).
 *
 * `context` denormalises the few strings the list needs (media title, thread
 * title) so rendering the notification screen is one query rather than one
 * join per notification type.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    /** Null for system-generated notifications. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Polymorphic: meaning depends on `type`. Not a foreign key by design. */
    entityId: uuid('entity_id'),
    context: jsonb('context').$type<NotificationContext>().notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_user_created_idx').on(table.userId, table.createdAt),
    // Powers the unread badge without scanning the whole table.
    index('notifications_user_unread_idx').on(table.userId, table.readAt),
  ],
)

export const activitiesRelations = relations(activities, ({ one, many }) => ({
  user: one(users, { fields: [activities.userId], references: [users.id] }),
  media: one(media, { fields: [activities.mediaId], references: [media.id] }),
  review: one(reviews, { fields: [activities.reviewId], references: [reviews.id] }),
  rating: one(ratings, { fields: [activities.ratingId], references: [ratings.id] }),
  list: one(lists, { fields: [activities.listId], references: [lists.id] }),
  likes: many(activityLikes),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'notification_recipient',
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'notification_actor',
  }),
}))
