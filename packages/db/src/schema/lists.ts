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
import { listVisibilityEnum } from './enums'
import { media } from './media'
import { users } from './users'

/** User-curated media collections (SPEC 15). */
export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    visibility: listVisibilityEnum('visibility').notNull().default('private'),
    /** Denormalised so the lists screen does not count rows per card. */
    itemCount: integer('item_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('lists_user_id_idx').on(table.userId),
    // Discovery of public lists, newest first.
    index('lists_visibility_updated_idx').on(table.visibility, table.updatedAt),
  ],
)

export const listItems = pgTable(
  'list_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    /** Sparse ordering (gaps of 1000) so a reorder rewrites one row, not all. */
    position: integer('position').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The same title cannot appear twice in one list.
    uniqueIndex('list_items_list_media_idx').on(table.listId, table.mediaId),
    index('list_items_list_position_idx').on(table.listId, table.position),
    index('list_items_media_idx').on(table.mediaId),
  ],
)

export const listsRelations = relations(lists, ({ one, many }) => ({
  user: one(users, { fields: [lists.userId], references: [users.id] }),
  items: many(listItems),
}))

export const listItemsRelations = relations(listItems, ({ one }) => ({
  list: one(lists, { fields: [listItems.listId], references: [lists.id] }),
  media: one(media, { fields: [listItems.mediaId], references: [media.id] }),
}))
