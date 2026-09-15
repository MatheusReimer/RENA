import { type Executor, schema } from '@revy/db'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

/**
 * Data access for direct messages (SPEC 12).
 *
 * Nothing here decrypts anything: rows go in and out carrying `ciphertext`,
 * `nonce` and `keyVersion`, and the service is the only layer that turns those
 * into text. Keeping that boundary here means a query added later cannot
 * accidentally return a body the cipher never saw -- there is no column that
 * could hold one.
 *
 * Every read is scoped to the viewer in SQL, not only in the service. That is
 * deliberate duplication: an unscoped `findById` is exactly the method someone
 * reuses in a hurry, so it does not exist (SPEC 27, OWASP A01).
 */

type ConversationRow = typeof schema.conversations.$inferSelect
type MessageRow = typeof schema.messages.$inferSelect

/** The other side of a two-person conversation, joined against the viewer's row. */
const otherParticipant = alias(schema.conversationParticipants, 'other_participant')

/**
 * The viewer's own user row.
 *
 * Aliased because `schema.users` is already joined as the *other* participant,
 * and both are needed: a thread renders messages from two people, and fetching
 * the viewer's own name per message would be a query per row.
 */
const viewerUser = alias(schema.users, 'viewer_user')

/**
 * The stable key for a pair of users.
 *
 * Sorted so A-B and B-A produce the same string, which is what makes the
 * unique index on `direct_key` mean "one conversation per pair" rather than
 * "one per pair per whoever asked first". Same normalisation the friendships
 * pair index does with LEAST/GREATEST, done here in JS because this value is
 * written into a column rather than computed by the index.
 */
export function directKeyFor(userA: string, userB: string): string {
  return [userA, userB].sort().join(':')
}

/**
 * Messages this viewer has hidden (SPEC 12).
 *
 * A correlated NOT EXISTS rather than a LEFT JOIN with an IS NULL filter: the
 * planner stops at the first matching hide row, and it cannot multiply the
 * result set the way a join against a non-unique side would.
 */
function notHiddenBy(viewerId: string) {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${schema.messageHides}
    WHERE ${schema.messageHides.messageId} = ${schema.messages.id}
      AND ${schema.messageHides.userId} = ${viewerId}
  )`
}

/**
 * Messages in this conversation the viewer has not read.
 *
 * Compared as a `(created_at, id)` tuple against the participant's stored read
 * position, which is the same tuple the thread is ordered and paged by.
 * Postgres compares rows lexicographically, so this is one index seek rather
 * than the `created_at > x OR (created_at = x AND id > y)` expansion -- and it
 * stays exact when two messages share a microsecond, which a timestamp-only
 * comparison would not.
 */
function unreadCountFor(viewerId: string) {
  return sql<number>`(
    SELECT count(*)::int FROM ${schema.messages}
    WHERE ${schema.messages.conversationId} = ${schema.conversations.id}
      AND ${schema.messages.senderId} <> ${viewerId}
      AND (
        ${schema.conversationParticipants.lastReadAt} IS NULL
        OR (${schema.messages.createdAt}, ${schema.messages.id})
           > (${schema.conversationParticipants.lastReadAt},
              ${schema.conversationParticipants.lastReadMessageId})
      )
      AND ${notHiddenBy(viewerId)}
  )`
}

export const conversationRepository = {
  /* ---------------------------------------------------------------- *
   * Conversations
   * ---------------------------------------------------------------- */

  async findDirect(db: Executor, userA: string, userB: string): Promise<ConversationRow | null> {
    const [row] = await db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.directKey, directKeyFor(userA, userB)))
      .limit(1)
    return row ?? null
  },

  /**
   * Creates a conversation and both participant rows atomically.
   *
   * A transaction because a conversation with one participant is unreachable
   * for the other person and, thanks to the unique key, permanently blocks
   * them from creating a working one.
   *
   * `onConflictDoNothing` turns losing a race into a null return rather than a
   * 500, which the service answers by fetching the row that won. Two people
   * opening each other's profile at the same moment is the ordinary case for
   * that, not an exotic one.
   */
  async createDirect(db: Executor, userA: string, userB: string): Promise<ConversationRow | null> {
    return db.transaction(async (tx) => {
      const [conversation] = await tx
        .insert(schema.conversations)
        .values({ directKey: directKeyFor(userA, userB) })
        .onConflictDoNothing()
        .returning()

      if (!conversation) return null

      await tx.insert(schema.conversationParticipants).values([
        { conversationId: conversation.id, userId: userA },
        { conversationId: conversation.id, userId: userB },
      ])

      return conversation
    })
  },

  /**
   * One conversation the viewer is in, with the other person's user row.
   *
   * The participant join is an inner join on the viewer, so a conversation
   * somebody else is in returns null -- the same answer as one that does not
   * exist. Intentional: distinguishing the two would tell a caller which
   * conversation ids are real (OWASP A01).
   */
  async findForViewer(db: Executor, conversationId: string, viewerId: string) {
    const [row] = await db
      .select({
        conversation: schema.conversations,
        participant: schema.users,
        viewer: viewerUser,
        lastReadAt: schema.conversationParticipants.lastReadAt,
      })
      .from(schema.conversations)
      .innerJoin(
        schema.conversationParticipants,
        and(
          eq(schema.conversationParticipants.conversationId, schema.conversations.id),
          eq(schema.conversationParticipants.userId, viewerId),
        ),
      )
      .innerJoin(
        otherParticipant,
        and(
          eq(otherParticipant.conversationId, schema.conversations.id),
          sql`${otherParticipant.userId} <> ${viewerId}`,
        ),
      )
      .innerJoin(schema.users, eq(schema.users.id, otherParticipant.userId))
      .innerJoin(viewerUser, eq(viewerUser.id, schema.conversationParticipants.userId))
      .where(eq(schema.conversations.id, conversationId))
      .limit(1)

    return row ?? null
  },

  /**
   * Every conversation the viewer is in, newest activity first.
   *
   * Unread counts are computed in the same pass as a correlated subquery
   * rather than fetched per row: a list of twelve conversations should be one
   * query, not thirteen. The previews are a second query -- see
   * `latestMessages` -- because they need the same hide filter and would
   * otherwise force this one into a lateral join for no gain.
   */
  async listForViewer(db: Executor, viewerId: string, limit: number) {
    return db
      .select({
        conversation: schema.conversations,
        participant: schema.users,
        unreadCount: unreadCountFor(viewerId),
      })
      .from(schema.conversations)
      .innerJoin(
        schema.conversationParticipants,
        and(
          eq(schema.conversationParticipants.conversationId, schema.conversations.id),
          eq(schema.conversationParticipants.userId, viewerId),
        ),
      )
      .innerJoin(
        otherParticipant,
        and(
          eq(otherParticipant.conversationId, schema.conversations.id),
          sql`${otherParticipant.userId} <> ${viewerId}`,
        ),
      )
      .innerJoin(schema.users, eq(schema.users.id, otherParticipant.userId))
      .orderBy(desc(schema.conversations.lastMessageAt))
      .limit(limit)
  },

  /**
   * The newest visible message in each of the given conversations.
   *
   * `DISTINCT ON` keeps one row per conversation, and the hide filter is
   * applied inside it rather than after -- so somebody who hid the last
   * message sees the one before it in their list, not a blank row. That is the
   * whole reason this is a query instead of a `last_message_id` column on
   * `conversations`: a denormalised pointer is the same for both participants,
   * and this is not.
   */
  async latestMessages(
    db: Executor,
    conversationIds: string[],
    viewerId: string,
  ): Promise<MessageRow[]> {
    if (conversationIds.length === 0) return []

    return db
      .selectDistinctOn([schema.messages.conversationId])
      .from(schema.messages)
      .where(
        and(
          inArray(schema.messages.conversationId, conversationIds),
          notHiddenBy(viewerId),
        ),
      )
      .orderBy(
        schema.messages.conversationId,
        desc(schema.messages.createdAt),
        desc(schema.messages.id),
      )
  },

  /** Unread messages across every conversation, for the navigation badge. */
  async countUnreadTotal(db: Executor, viewerId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${unreadCountFor(viewerId)}), 0)::int` })
      .from(schema.conversations)
      .innerJoin(
        schema.conversationParticipants,
        and(
          eq(schema.conversationParticipants.conversationId, schema.conversations.id),
          eq(schema.conversationParticipants.userId, viewerId),
        ),
      )

    return row?.total ?? 0
  },

  /* ---------------------------------------------------------------- *
   * Messages
   * ---------------------------------------------------------------- */

  /**
   * A page of a thread, in whichever direction was asked for.
   *
   * Keyset rather than OFFSET, on the `(created_at, id)` tuple the index is
   * built for. OFFSET would be wrong here quite apart from being slow: a
   * message arriving mid-scroll shifts every subsequent page by one, so the
   * reader sees a message twice or not at all.
   *
   * `before` reads backwards and therefore selects in descending order; the
   * caller reverses it for display. `after` is the poll, and is already in
   * display order.
   */
  async listMessages(
    db: Executor,
    conversationId: string,
    viewerId: string,
    options: { cursor: { createdAt: Date; id: string } | null; direction: 'before' | 'after'; limit: number },
  ): Promise<MessageRow[]> {
    const { cursor, direction, limit } = options
    const backwards = direction === 'before'

    const keyset = cursor
      ? backwards
        ? sql`(${schema.messages.createdAt}, ${schema.messages.id}) < (${cursor.createdAt}, ${cursor.id})`
        : sql`(${schema.messages.createdAt}, ${schema.messages.id}) > (${cursor.createdAt}, ${cursor.id})`
      : undefined

    const rows = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.conversationId, conversationId),
          notHiddenBy(viewerId),
          keyset,
        ),
      )
      .orderBy(
        backwards
          ? desc(schema.messages.createdAt)
          : asc(schema.messages.createdAt),
        backwards ? desc(schema.messages.id) : asc(schema.messages.id),
      )
      .limit(limit)

    // Callers always render oldest-first; reversing here keeps that promise in
    // one place rather than at every call site.
    return backwards ? rows.reverse() : rows
  },

  /**
   * One message, scoped to its conversation.
   *
   * Scoped rather than looked up by id alone because both callers use it to
   * validate something the client sent -- a paging cursor and a read marker.
   * An unscoped lookup would answer "does this message id exist" for messages
   * in conversations the caller cannot see.
   */
  async findMessageInConversation(
    db: Executor,
    conversationId: string,
    messageId: string,
  ): Promise<MessageRow | null> {
    const [row] = await db
      .select()
      .from(schema.messages)
      .where(
        and(
          eq(schema.messages.id, messageId),
          eq(schema.messages.conversationId, conversationId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /**
   * Writes a message and bumps the conversation's ordering key.
   *
   * One transaction: a message whose conversation did not move to the top of
   * the list is a message the recipient does not see arrive, and a bump with
   * no message underneath it is a conversation that claims activity it has
   * not had.
   */
  async insertMessage(
    db: Executor,
    values: {
      id: string
      conversationId: string
      senderId: string
      ciphertext: Uint8Array
      nonce: Uint8Array
      keyVersion: number
    },
  ): Promise<MessageRow> {
    return db.transaction(async (tx) => {
      const [message] = await tx.insert(schema.messages).values(values).returning()
      if (!message) throw new Error('Message insert returned no row.')

      await tx
        .update(schema.conversations)
        .set({ lastMessageAt: message.createdAt })
        .where(eq(schema.conversations.id, values.conversationId))

      return message
    })
  },

  /**
   * Moves the viewer's read position forward.
   *
   * Never backwards: two devices reading the same thread would otherwise
   * ping-pong the badge, and a slow request arriving out of order would
   * resurrect messages the reader has already seen. The comparison is the same
   * tuple the unread count uses, so "read" means exactly one thing.
   */
  async markRead(
    db: Executor,
    conversationId: string,
    userId: string,
    upTo: { createdAt: Date; id: string },
  ): Promise<void> {
    await db
      .update(schema.conversationParticipants)
      .set({ lastReadAt: upTo.createdAt, lastReadMessageId: upTo.id })
      .where(
        and(
          eq(schema.conversationParticipants.conversationId, conversationId),
          eq(schema.conversationParticipants.userId, userId),
          sql`(
            ${schema.conversationParticipants.lastReadAt} IS NULL
            OR (${schema.conversationParticipants.lastReadAt},
                ${schema.conversationParticipants.lastReadMessageId})
               < (${upTo.createdAt}, ${upTo.id})
          )`,
        ),
      )
  },

  /** Hides a message from one participant's view. Idempotent. */
  async hideMessage(db: Executor, messageId: string, userId: string): Promise<void> {
    await db
      .insert(schema.messageHides)
      .values({ messageId, userId })
      .onConflictDoNothing()
  },
}
