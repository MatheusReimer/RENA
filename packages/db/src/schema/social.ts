import { relations, sql } from 'drizzle-orm'
import { check, index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { friendshipStatusEnum } from './enums'
import { users } from './users'

/**
 * Friendships (SPEC 12).
 *
 * One row represents the relationship between two users regardless of who
 * initiated it. `requester_id` / `receiver_id` preserve direction (needed to
 * decide whether the viewer sees "Accept" or "Cancel"), but uniqueness is
 * enforced on the *unordered pair* so A->B and B->A can never both exist.
 * SPEC 12 and SPEC 39 both call this out explicitly.
 */
export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    receiverId: uuid('receiver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendshipStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The pair is normalised at the index level, so a duplicate request in
    // either direction fails at the database rather than relying on a
    // read-then-write check that would race.
    uniqueIndex('friendships_pair_idx').on(
      sql`LEAST(${table.requesterId}, ${table.receiverId})`,
      sql`GREATEST(${table.requesterId}, ${table.receiverId})`,
    ),
    index('friendships_requester_idx').on(table.requesterId, table.status),
    index('friendships_receiver_idx').on(table.receiverId, table.status),
    // SPEC 12: you cannot befriend yourself.
    check('friendships_no_self', sql`${table.requesterId} <> ${table.receiverId}`),
  ],
)

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  requester: one(users, {
    fields: [friendships.requesterId],
    references: [users.id],
    relationName: 'friendship_requester',
  }),
  receiver: one(users, {
    fields: [friendships.receiverId],
    references: [users.id],
    relationName: 'friendship_receiver',
  }),
}))
