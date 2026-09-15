import { relations, sql } from 'drizzle-orm'
import {
  check,
  customType,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { users } from './users'

/**
 * Direct messages (SPEC 12).
 *
 * Two properties are structural here rather than conventional, because both
 * are the kind of thing that is correct until the day somebody adds a query:
 *
 *  1. **Message bodies are never stored as text.** The only column that holds
 *     one is `ciphertext`, a bytea. There is no `content` column to
 *     accidentally write to, so a stolen dump, a leaked backup or a read
 *     replica exposed by a misconfiguration yields nothing without the key,
 *     which lives in the environment and not the database (OWASP A02).
 *
 *  2. **A pair of people can only have one conversation.** Enforced by a
 *     unique index on a normalised key rather than by a read-then-insert,
 *     which races: two people opening each other's profile at the same moment
 *     is exactly when that check loses.
 *
 * This is encryption at rest, not end-to-end. The server holds the key and can
 * read every message -- which is what keeps notifications, moderation and
 * abuse handling possible. The interface must therefore never call these
 * "end-to-end encrypted"; the honest word is private.
 */

/**
 * Raw bytes.
 *
 * Declared here rather than imported because Drizzle's pg-core does not ship a
 * `bytea` column type. The driver hands back a Buffer, and `fromDriver`
 * normalises it to a Uint8Array so nothing above the schema depends on Node's
 * Buffer -- the crypto module works with Uint8Array, and so does WebCrypto if
 * this ever runs somewhere without Buffer.
 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  fromDriver: (value) => new Uint8Array(value),
  toDriver: (value) => Buffer.from(value),
})

/**
 * A conversation between two people.
 *
 * `direct_key` is the normalised pair -- `LEAST(a,b):GREATEST(a,b)` -- written
 * by the service and made unique here. It is deliberately denormalised: the
 * participants live in a join table, and a unique index cannot span tables, so
 * without this column "one conversation per pair" would be a convention
 * enforced by a SELECT that two concurrent requests can both pass.
 *
 * It is nullable on purpose. Group conversations, if they are ever added, have
 * no pair to normalise and carry NULL here -- and Postgres allows any number
 * of NULLs in a unique index, so they need no schema change to coexist.
 */
export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    directKey: text('direct_key'),
    /**
     * Bumped on every send; orders the conversation list.
     *
     * Defaulted to creation time rather than left null, so a conversation that
     * has been opened but not yet spoken in still sorts sensibly instead of
     * falling to the bottom of every list.
     */
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('conversations_direct_key_idx').on(table.directKey),
    index('conversations_last_message_idx').on(table.lastMessageAt),
  ],
)

/**
 * Who is in a conversation, and how far they have read.
 *
 * A join table for a feature that is currently one-to-one, which looks like
 * over-engineering and is not: the alternative is two user id columns on
 * `conversations`, and every query written against those has to be rewritten
 * the day a third person is allowed in. This shape costs one join now and
 * nothing later.
 *
 * Read position is a `(timestamp, id)` pair rather than a timestamp alone,
 * because that is the same tuple the message list is ordered and paged by.
 * Comparing on the tuple makes the unread count exact even when two messages
 * share a microsecond; comparing on the timestamp alone would silently mark
 * the second one read.
 */
export const conversationParticipants = pgTable(
  'conversation_participants',
  {
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Null until they have read anything: everything counts as unread. */
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    lastReadMessageId: uuid('last_read_message_id'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.conversationId, table.userId] }),
    // The conversation list: every thread one user is in, newest first once
    // joined to `conversations`.
    index('conversation_participants_user_idx').on(table.userId),
    // Both halves of the read pair are set together or neither is. Without
    // this a partial write would make the tuple comparison compare against
    // NULL and report every message unread, forever.
    check(
      'conversation_participants_read_pair',
      sql`(${table.lastReadAt} IS NULL) = (${table.lastReadMessageId} IS NULL)`,
    ),
  ],
)

/**
 * One message.
 *
 * `ciphertext` is AES-256-GCM output and `nonce` the 12-byte IV it was sealed
 * with. The GCM tag is appended to the ciphertext by the cipher rather than
 * stored apart, because the two are only ever used together and a tag in its
 * own column is a tag that can be forgotten in a join.
 *
 * `key_version` is what makes key rotation possible without a migration: a new
 * key is added alongside the old one, new rows are written at the new version,
 * and old rows keep decrypting at theirs. Without it, rotating a key means
 * rewriting every row in the table or losing every message written before it.
 *
 * The id is generated by the application rather than by `defaultRandom()`, and
 * that is load-bearing: the id is part of the additional authenticated data,
 * so it has to exist before the body is sealed. See `messageCipher`.
 */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ciphertext: bytea('ciphertext').notNull(),
    nonce: bytea('nonce').notNull(),
    keyVersion: smallint('key_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Every read of this table is "this conversation, in order": the thread
    // itself, both paging directions, and the unread count. One composite
    // index serves all four, and it carries `id` so the keyset cursor is a
    // tuple the index can seek on rather than a filter applied after.
    index('messages_conversation_created_idx').on(
      table.conversationId,
      table.createdAt,
      table.id,
    ),
    index('messages_sender_idx').on(table.senderId),
  ],
)

/**
 * A message one participant has hidden from their own view (SPEC 12).
 *
 * "Delete for me", and nothing more: the row stays, the other person still
 * sees it. A table rather than a flag column because the thing being recorded
 * belongs to the reader, not to the message -- the same message is hidden for
 * one participant and visible to the other, which a column cannot express.
 *
 * Deliberately not an unsend. Retracting a message from someone else's screen
 * is a promise that cannot be kept once they have read it, and offering it
 * implies otherwise.
 */
export const messageHides = pgTable(
  'message_hides',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.userId] }),
    // Anti-joined against on every thread read, keyed by the reader.
    index('message_hides_user_idx').on(table.userId),
  ],
)

export const conversationsRelations = relations(conversations, ({ many }) => ({
  participants: many(conversationParticipants),
  messages: many(messages),
}))

export const conversationParticipantsRelations = relations(
  conversationParticipants,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationParticipants.conversationId],
      references: [conversations.id],
    }),
    user: one(users, {
      fields: [conversationParticipants.userId],
      references: [users.id],
    }),
  }),
)

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(users, { fields: [messages.senderId], references: [users.id] }),
  hides: many(messageHides),
}))

export const messageHidesRelations = relations(messageHides, ({ one }) => ({
  message: one(messages, { fields: [messageHides.messageId], references: [messages.id] }),
  user: one(users, { fields: [messageHides.userId], references: [users.id] }),
}))
