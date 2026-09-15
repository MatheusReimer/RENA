import { PAGE_SIZE_MAX } from '@revy/shared/constants'
import type {
  MarkConversationReadInput,
  MessageQueryInput,
  SendMessageInput,
} from '@revy/shared/schemas'
import type {
  ConversationDetail,
  ConversationSummary,
  Message,
  MessagePreview,
} from '@revy/shared/types'
import { errors, excerpt } from '@revy/shared/utils'
import { randomUUID } from 'node:crypto'
import { requireMessageCipher, requireViewer, type AuthenticatedContext, type ServiceContext } from '../context'
import type { MessageCipher, SealedMessage } from '../crypto'
import { toUserSummary } from '../mappers'
import { conversationRepository, friendshipRepository, userRepository } from '../repositories'

/**
 * Direct messages (SPEC 12).
 *
 * Three rules hold this feature together, and all three live here rather than
 * in the routes, because a rule enforced at the transport is a rule that is
 * missing from the next transport:
 *
 *  1. **You can only read a conversation you are in.** Every method starts
 *     from `requireParticipation`, which resolves the conversation *through*
 *     the viewer's participant row -- so "not yours" and "does not exist" are
 *     the same 404 and conversation ids cannot be probed (OWASP A01).
 *
 *  2. **You can only message a friend.** Checked against the friendship at
 *     send time, not at conversation-open time, so unfriending or blocking
 *     takes effect immediately on a thread that is already open.
 *
 *  3. **Bodies are encrypted before they leave this file and decrypted after
 *     they return to it.** The repository never sees plaintext and the API
 *     never sees ciphertext.
 */

/** Enough of the newest message for a list row, without shipping the body. */
const PREVIEW_LENGTH = 120

/**
 * Shown in place of a message that will not decrypt.
 *
 * This should be unreachable. It is here because the alternative -- letting
 * the error escape -- means one corrupt or tampered row takes down the entire
 * conversation for both people, which is a denial of service triggered by a
 * single bad byte. Failing one message loudly and keeping the rest readable is
 * the better trade, and the real error is logged server-side where someone can
 * act on it.
 */
const UNREADABLE = 'This message could not be read.'

export const conversationService = {
  /**
   * Opens the conversation with someone, creating it if there is not one yet.
   *
   * Idempotent by design: the client calls this every time somebody presses
   * "Message", and gets the same conversation back each time.
   */
  async start(ctx: ServiceContext, targetUserId: string): Promise<ConversationDetail> {
    const auth = requireViewer(ctx)
    // Reading a thread needs the cipher as much as writing one does, so a
    // deployment with no key refuses here rather than creating an empty
    // conversation nobody can ever speak in.
    requireMessageCipher(auth)

    if (targetUserId === auth.viewerId) {
      throw errors.notFound('NOT_FRIENDS', 'You cannot message yourself.')
    }

    const target = await userRepository.findById(auth.db, targetUserId)
    if (!target) throw errors.userNotFound()

    await assertCanMessage(auth, targetUserId)

    const existing = await conversationRepository.findDirect(auth.db, auth.viewerId, targetUserId)
    if (existing) {
      return {
        id: existing.id,
        participant: toUserSummary(target),
        canSend: true,
        createdAt: existing.createdAt.toISOString(),
      }
    }

    const created = await conversationRepository.createDirect(
      auth.db,
      auth.viewerId,
      targetUserId,
    )

    if (!created) {
      // Lost the race against the other person pressing Message at the same
      // moment. Their row is the real one.
      const winner = await conversationRepository.findDirect(
        auth.db,
        auth.viewerId,
        targetUserId,
      )
      if (!winner) throw errors.internal()
      return {
        id: winner.id,
        participant: toUserSummary(target),
        canSend: true,
        createdAt: winner.createdAt.toISOString(),
      }
    }

    return {
      id: created.id,
      participant: toUserSummary(target),
      canSend: true,
      createdAt: created.createdAt.toISOString(),
    }
  },

  /** The viewer's conversations, most recently active first. */
  async list(ctx: ServiceContext): Promise<ConversationSummary[]> {
    const auth = requireViewer(ctx)
    const cipher = requireMessageCipher(auth)

    const rows = await conversationRepository.listForViewer(auth.db, auth.viewerId, PAGE_SIZE_MAX)
    if (rows.length === 0) return []

    /*
     * Previews and send-permission in two batched queries rather than two per
     * conversation. Twelve conversations should cost three queries in total,
     * and the version of this that did not would not show up in development
     * with four rows of seed data.
     */
    const previews = await conversationRepository.latestMessages(
      auth.db,
      rows.map((row) => row.conversation.id),
      auth.viewerId,
    )
    const previewByConversation = new Map(previews.map((row) => [row.conversationId, row]))

    const friendIds = new Set(await friendshipRepository.listFriendIds(auth.db, auth.viewerId))

    return rows.map((row) => {
      const preview = previewByConversation.get(row.conversation.id)

      return {
        id: row.conversation.id,
        participant: toUserSummary(row.participant),
        lastMessage: preview ? toPreview(cipher, preview) : null,
        unreadCount: row.unreadCount,
        lastActivityAt: row.conversation.lastMessageAt.toISOString(),
        canSend: friendIds.has(row.participant.id),
      }
    })
  },

  /** One conversation's header: who it is with, and whether it is open. */
  async get(ctx: ServiceContext, conversationId: string): Promise<ConversationDetail> {
    const auth = requireViewer(ctx)
    requireMessageCipher(auth)

    const row = await requireParticipation(auth, conversationId)

    return {
      id: row.conversation.id,
      participant: toUserSummary(row.participant),
      canSend: await canMessage(auth, row.participant.id),
      createdAt: row.conversation.createdAt.toISOString(),
    }
  },

  /**
   * A page of a thread.
   *
   * Both cursors are message ids resolved against *this* conversation, so a
   * cursor from somewhere else is simply not found -- it cannot be used to
   * learn whether a message id exists elsewhere.
   */
  async listMessages(
    ctx: ServiceContext,
    conversationId: string,
    input: MessageQueryInput,
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const auth = requireViewer(ctx)
    const cipher = requireMessageCipher(auth)

    const row = await requireParticipation(auth, conversationId)
    // Both summaries come from the one participation query, so rendering a
    // page of messages costs no extra round trip per sender.
    const sender = toUserSummary(row.participant)
    const viewer = toUserSummary(row.viewer)

    const cursorId = input.before ?? input.after ?? null
    const cursorRow = cursorId
      ? await conversationRepository.findMessageInConversation(auth.db, conversationId, cursorId)
      : null

    if (cursorId && !cursorRow) {
      throw errors.notFound('MESSAGE_NOT_FOUND', 'That message is no longer in this conversation.')
    }

    const direction = input.before ? 'before' : 'after'

    // One extra row, purely to answer "is there more" without a count query.
    const rows = await conversationRepository.listMessages(auth.db, conversationId, auth.viewerId, {
      cursor: cursorRow ? { createdAt: cursorRow.createdAt, id: cursorRow.id } : null,
      direction,
      limit: input.limit + 1,
    })

    const hasMore = rows.length > input.limit
    // Reading backwards returns oldest-first, so the surplus row is at the
    // front; reading forwards it is at the end. Trimming the wrong end would
    // silently drop the newest message on every poll that filled a page.
    const page = hasMore
      ? direction === 'before'
        ? rows.slice(rows.length - input.limit)
        : rows.slice(0, input.limit)
      : rows

    return {
      messages: page.map((message) =>
        toMessage(cipher, message, message.senderId === auth.viewerId ? viewer : sender),
      ),
      hasMore,
    }
  },

  /**
   * Sends a message.
   *
   * The friendship is re-checked here rather than trusted from when the
   * conversation was opened: a tab left open across an unfriend must not still
   * be able to send, and the client's `canSend` flag is a hint for the UI, not
   * a permission.
   */
  async send(
    ctx: ServiceContext,
    conversationId: string,
    input: SendMessageInput,
  ): Promise<Message> {
    const auth = requireViewer(ctx)
    const cipher = requireMessageCipher(auth)

    const row = await requireParticipation(auth, conversationId)
    await assertCanMessage(auth, row.participant.id)

    /*
     * The id is generated here, before the body is sealed, because it is part
     * of the additional authenticated data -- the tag has to cover the id the
     * row will actually have. Letting the database default it would mean
     * sealing against an id we do not yet know.
     */
    const id = randomUUID()
    const sealed = cipher.seal(input.content, {
      conversationId,
      messageId: id,
      senderId: auth.viewerId,
    })

    const message = await conversationRepository.insertMessage(auth.db, {
      id,
      conversationId,
      senderId: auth.viewerId,
      ciphertext: sealed.ciphertext,
      nonce: sealed.nonce,
      keyVersion: sealed.keyVersion,
    })

    /*
     * Sending is also reading: the sender has, by definition, seen everything
     * up to their own message. Without this their own message would count as
     * unread to them on the next poll.
     */
    await conversationRepository.markRead(auth.db, conversationId, auth.viewerId, {
      createdAt: message.createdAt,
      id: message.id,
    })

    return {
      id: message.id,
      conversationId,
      sender: toUserSummary(row.viewer),
      content: input.content,
      createdAt: message.createdAt.toISOString(),
    }
  },

  /**
   * Marks the thread read up to a message the client has actually rendered.
   *
   * Returns the viewer's new total across every conversation, because the
   * caller's next act is always to correct the badge in the shell. Computing
   * it here is one indexed aggregate on a connection that is already open; the
   * alternative is the client guessing, or a second round trip to `/api/me`
   * for a number this request has just changed.
   */
  async markRead(
    ctx: ServiceContext,
    conversationId: string,
    input: MarkConversationReadInput,
  ): Promise<{ unreadMessages: number }> {
    const auth = requireViewer(ctx)
    await requireParticipation(auth, conversationId)

    const message = await conversationRepository.findMessageInConversation(
      auth.db,
      conversationId,
      input.messageId,
    )
    if (!message) {
      throw errors.notFound('MESSAGE_NOT_FOUND', 'That message is no longer in this conversation.')
    }

    await conversationRepository.markRead(auth.db, conversationId, auth.viewerId, {
      createdAt: message.createdAt,
      id: message.id,
    })

    return { unreadMessages: await conversationRepository.countUnreadTotal(auth.db, auth.viewerId) }
  },

  /**
   * Hides a message from the viewer's own copy of the thread (SPEC 12).
   *
   * Deliberately not an unsend: the other participant still sees it. Anything
   * else would be a promise we cannot keep -- they may have read it, and on
   * mobile they may have a notification of it sitting on a lock screen.
   */
  async hideMessage(
    ctx: ServiceContext,
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const auth = requireViewer(ctx)
    await requireParticipation(auth, conversationId)

    const message = await conversationRepository.findMessageInConversation(
      auth.db,
      conversationId,
      messageId,
    )
    if (!message) throw errors.notFound('MESSAGE_NOT_FOUND', 'Message not found.')

    await conversationRepository.hideMessage(auth.db, messageId, auth.viewerId)
  },

  /**
   * Unread messages across every conversation.
   *
   * Returns 0 rather than throwing when signed out or unconfigured: this backs
   * a badge on a screen that has to render either way, and `/api/me` calls it
   * on every page load.
   */
  async countUnread(ctx: ServiceContext): Promise<number> {
    if (!ctx.viewerId || !ctx.messageCipher) return 0
    return conversationRepository.countUnreadTotal(ctx.db, ctx.viewerId)
  },
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

/**
 * Resolves a conversation through the viewer's participant row, or 404s.
 *
 * The single authorization gate for this whole service. It returns the row
 * rather than a boolean so callers cannot check membership and then fetch the
 * conversation by a different path -- there is only one path.
 */
async function requireParticipation(auth: AuthenticatedContext, conversationId: string) {
  const row = await conversationRepository.findForViewer(auth.db, conversationId, auth.viewerId)
  if (!row) {
    throw errors.notFound('CONVERSATION_NOT_FOUND', 'Conversation not found.')
  }
  return row
}

/**
 * Whether the viewer may send to this person right now.
 *
 * Accepted friendship and nothing else. A blocked relationship is not accepted
 * and so fails here too, which is the intended behaviour -- blocking should
 * close the composer, not merely hide a button.
 */
async function canMessage(auth: AuthenticatedContext, targetUserId: string): Promise<boolean> {
  const friendship = await friendshipRepository.findBetween(auth.db, auth.viewerId, targetUserId)
  return friendship?.status === 'accepted'
}

async function assertCanMessage(
  auth: AuthenticatedContext,
  targetUserId: string,
): Promise<void> {
  if (!(await canMessage(auth, targetUserId))) throw errors.notFriends()
}

function toMessage(
  cipher: MessageCipher,
  row: {
    id: string
    conversationId: string
    senderId: string
    ciphertext: Uint8Array
    nonce: Uint8Array
    keyVersion: number
    createdAt: Date
  },
  sender: ReturnType<typeof toUserSummary>,
): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    sender,
    content: open(cipher, row),
    createdAt: row.createdAt.toISOString(),
  }
}

function toPreview(
  cipher: MessageCipher,
  row: {
    id: string
    conversationId: string
    senderId: string
    ciphertext: Uint8Array
    nonce: Uint8Array
    keyVersion: number
    createdAt: Date
  },
): MessagePreview {
  return {
    id: row.id,
    excerpt: excerpt(open(cipher, row), PREVIEW_LENGTH),
    senderId: row.senderId,
    createdAt: row.createdAt.toISOString(),
  }
}

/** Opens one body, substituting a marker rather than failing the whole thread. */
function open(
  cipher: MessageCipher,
  row: SealedMessage & { id: string; conversationId: string; senderId: string },
): string {
  try {
    return cipher.open(row, {
      conversationId: row.conversationId,
      messageId: row.id,
      senderId: row.senderId,
    })
  } catch (error) {
    // Logged with the id but never the body or the key: this line ends up in a
    // log aggregator, which is exactly the place the ciphertext must not be.
    console.error(`[revy] could not decrypt message ${row.id}`, error)
    return UNREADABLE
  }
}
