import { COMMENT_MAX_DEPTH, PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import type { CreateCommentInput, CreateThreadInput } from '@revy/shared/schemas'
import type {
  DiscussionComment,
  DiscussionCommentNode,
  DiscussionThread,
  Media,
  Paginated,
} from '@revy/shared/types'
import { errors, excerpt } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import {
  discussionRepository,
  mediaRepository,
  notificationRepository,
  userRepository,
} from '../repositories'
import { badgeService } from './badge.service'
import { xpService } from './xp.service'

/**
 * Media discussions (SPEC 14).
 *
 * Every media item is a community. SPEC 14 scopes the MVP to plain
 * request/response -- no realtime -- and that is what this is: threads, nested
 * replies, spoiler flags, and nothing that needs a socket.
 */

/** A thread page fetches its whole comment tree; this caps the damage. */
const MAX_COMMENTS_PER_THREAD = 500

export const discussionService = {
  /**
   * Opens a new thread, optionally with its first comment (SPEC 14).
   *
   * Thread and opening comment are written together: a thread with a title and
   * no body reads as broken, and two requests could leave exactly that.
   */
  async createThread(
    ctx: ServiceContext,
    input: CreateThreadInput,
  ): Promise<DiscussionThread> {
    const auth = requireViewer(ctx)

    const media = await mediaRepository.findById(auth.db, input.mediaId)
    if (!media) throw errors.mediaNotFound()

    return auth.db.transaction(async (tx) => {
      const thread = await discussionRepository.createThread(tx, {
        mediaId: input.mediaId,
        userId: auth.viewerId,
        title: input.title,
        spoiler: input.spoiler,
      })

      if (input.content) {
        await discussionRepository.createComment(tx, {
          threadId: thread.id,
          userId: auth.viewerId,
          content: input.content,
          // The opening comment inherits the thread's spoiler flag: marking the
          // thread and then leaking the spoiler in its first post would defeat
          // the point.
          spoiler: input.spoiler,
          depth: 0,
        })
        await discussionRepository.recordReply(tx, thread.id, new Date())
      }

      await xpService.award(tx, auth.viewerId, 'create_discussion')
      await badgeService.evaluate(tx, auth.viewerId, 'discussion')

      const author = await requireAuthor(ctx, auth.viewerId)

      return {
        id: thread.id,
        mediaId: thread.mediaId,
        user: author,
        title: thread.title,
        spoiler: thread.spoiler,
        replyCount: input.content ? 1 : 0,
        lastActivityAt: thread.lastActivityAt.toISOString(),
        createdAt: thread.createdAt.toISOString(),
      }
    })
  },

  /** Threads for a media item, most recently active first (SPEC 14). */
  async listForMedia(
    ctx: ServiceContext,
    mediaId: string,
    limit = PAGE_SIZE_DEFAULT,
    cursor: string | null = null,
  ): Promise<Paginated<DiscussionThread>> {
    // One extra row tells us whether another page exists without a COUNT.
    const rows = await discussionRepository.listThreadsForMedia(
      ctx.db,
      mediaId,
      limit + 1,
      parseCursor(cursor),
    )

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    const items: DiscussionThread[] = page.map((row) => ({
      id: row.thread.id,
      mediaId: row.thread.mediaId,
      user: toUserSummary(row.user),
      title: row.thread.title,
      spoiler: row.thread.spoiler,
      replyCount: row.thread.replyCount,
      lastActivityAt: row.thread.lastActivityAt.toISOString(),
      createdAt: row.thread.createdAt.toISOString(),
    }))

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.lastActivityAt ?? null) : null,
    }
  },

  /**
   * A thread with its full comment tree (SPEC 14).
   *
   * Comments come back flat from one query and are assembled here, so rendering
   * a five-level thread costs one round trip rather than five.
   */
  async getThread(
    ctx: ServiceContext,
    threadId: string,
  ): Promise<{ thread: DiscussionThread; media: Media; comments: DiscussionCommentNode[] }> {
    const row = await discussionRepository.findThreadWithContext(ctx.db, threadId)
    if (!row) throw errors.notFound('THREAD_NOT_FOUND', 'Discussion not found.')

    const commentRows = await discussionRepository.listCommentsForThread(
      ctx.db,
      threadId,
      MAX_COMMENTS_PER_THREAD,
    )

    const comments: DiscussionComment[] = commentRows.map((entry) => ({
      id: entry.comment.id,
      threadId: entry.comment.threadId,
      user: toUserSummary(entry.user),
      parentCommentId: entry.comment.parentCommentId,
      content: entry.comment.content,
      spoiler: entry.comment.spoiler,
      depth: entry.comment.depth,
      replyCount: entry.comment.replyCount,
      createdAt: entry.comment.createdAt.toISOString(),
      updatedAt: entry.comment.updatedAt.toISOString(),
    }))

    return {
      thread: {
        id: row.thread.id,
        mediaId: row.thread.mediaId,
        user: toUserSummary(row.user),
        title: row.thread.title,
        spoiler: row.thread.spoiler,
        replyCount: row.thread.replyCount,
        lastActivityAt: row.thread.lastActivityAt.toISOString(),
        createdAt: row.thread.createdAt.toISOString(),
      },
      media: toMedia(row.media),
      comments: buildCommentTree(comments),
    }
  },

  /**
   * Posts a comment or a nested reply (SPEC 14).
   *
   * Depth is derived from the parent rather than trusted from the client, and
   * capped at COMMENT_MAX_DEPTH -- both because unbounded nesting is unreadable
   * on a phone, and because a client-supplied depth is a client-supplied lie
   * waiting to happen (SPEC 25).
   */
  async createComment(
    ctx: ServiceContext,
    threadId: string,
    input: CreateCommentInput,
  ): Promise<DiscussionComment> {
    const auth = requireViewer(ctx)

    const thread = await discussionRepository.findThreadById(auth.db, threadId)
    if (!thread) throw errors.notFound('THREAD_NOT_FOUND', 'Discussion not found.')

    let depth = 0
    let parentCommentId: string | null = null
    let notifyUserId: string | null = thread.userId

    if (input.parentCommentId) {
      const parent = await discussionRepository.findCommentById(auth.db, input.parentCommentId)
      if (!parent) throw errors.notFound('COMMENT_NOT_FOUND', 'That comment no longer exists.')

      // A reply must belong to the thread it claims to be in, or a crafted
      // request could graft a comment from one discussion onto another.
      if (parent.threadId !== threadId) {
        throw errors.notFound('COMMENT_NOT_FOUND', 'That comment is not in this discussion.')
      }

      if (parent.depth + 1 > COMMENT_MAX_DEPTH) {
        throw errors.notFound(
          'COMMENT_DEPTH_EXCEEDED',
          'This conversation is nested as deep as it goes. Reply higher up the thread.',
        )
      }

      depth = parent.depth + 1
      parentCommentId = parent.id
      // Replying notifies the person replied to, not the thread starter.
      notifyUserId = parent.userId
    }

    const now = new Date()

    const created = await auth.db.transaction(async (tx) => {
      const comment = await discussionRepository.createComment(tx, {
        threadId,
        userId: auth.viewerId,
        parentCommentId,
        content: input.content,
        spoiler: input.spoiler,
        depth,
      })

      await discussionRepository.recordReply(tx, threadId, now)
      if (parentCommentId) {
        await discussionRepository.incrementCommentReplies(tx, parentCommentId)
      }

      // Never notify someone about their own comment.
      if (notifyUserId && notifyUserId !== auth.viewerId) {
        await notificationRepository.create(tx, {
          userId: notifyUserId,
          type: 'reply_to_discussion',
          actorId: auth.viewerId,
          entityId: threadId,
          context: {
            threadId,
            threadTitle: thread.title,
            mediaId: thread.mediaId,
            // Spoiler content must not leak through a notification preview.
            excerpt: input.spoiler ? 'Contains spoilers' : excerpt(input.content, 90),
          },
        })
      }

      await xpService.award(tx, auth.viewerId, 'create_comment')
      await badgeService.evaluate(tx, auth.viewerId, 'comment')

      return comment
    })

    const author = await requireAuthor(ctx, auth.viewerId)

    return {
      id: created.id,
      threadId: created.threadId,
      user: author,
      parentCommentId: created.parentCommentId,
      content: created.content,
      spoiler: created.spoiler,
      depth: created.depth,
      replyCount: 0,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    }
  },

  /** Deletes a comment. Only its author may (SPEC 27). */
  async removeComment(ctx: ServiceContext, commentId: string): Promise<void> {
    const auth = requireViewer(ctx)

    const comment = await discussionRepository.findCommentById(auth.db, commentId)
    if (!comment) throw errors.notFound('COMMENT_NOT_FOUND', 'Comment not found.')
    if (comment.userId !== auth.viewerId) {
      throw errors.forbidden('You can only delete your own comments.')
    }

    await auth.db.transaction(async (tx) => {
      await discussionRepository.removeComment(tx, commentId)
      await xpService.revoke(tx, auth.viewerId, 'create_comment')
    })
  },

  /** Deletes a thread and everything under it. Only its author may (SPEC 27). */
  async removeThread(ctx: ServiceContext, threadId: string): Promise<void> {
    const auth = requireViewer(ctx)

    const thread = await discussionRepository.findThreadById(auth.db, threadId)
    if (!thread) throw errors.notFound('THREAD_NOT_FOUND', 'Discussion not found.')
    if (thread.userId !== auth.viewerId) {
      throw errors.forbidden('You can only delete your own discussions.')
    }

    await auth.db.transaction(async (tx) => {
      // Comments cascade from the thread's foreign key.
      await discussionRepository.removeThread(tx, threadId)
      await xpService.revoke(tx, auth.viewerId, 'create_discussion')
    })
  },
}

/**
 * Assembles flat comments into a reply tree.
 *
 * Input is ordered oldest-first, so a parent is always seen before its
 * children and one pass suffices. An orphan -- a comment whose parent was
 * deleted mid-read -- is promoted to the top level rather than dropped,
 * because silently losing someone's words is worse than showing them
 * slightly out of place.
 */
export function buildCommentTree(comments: DiscussionComment[]): DiscussionCommentNode[] {
  const nodes = new Map<string, DiscussionCommentNode>()
  const roots: DiscussionCommentNode[] = []

  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] })
  }

  for (const comment of comments) {
    const node = nodes.get(comment.id)!
    const parent = comment.parentCommentId ? nodes.get(comment.parentCommentId) : undefined

    if (parent) parent.replies.push(node)
    else roots.push(node)
  }

  return roots
}

/** Cursors are ISO timestamps; anything unparseable restarts at page one. */
function parseCursor(cursor: string | null): Date | null {
  if (!cursor) return null
  const date = new Date(cursor)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Loads the author row that every thread and comment response embeds. */
async function requireAuthor(ctx: ServiceContext, userId: string) {
  const user = await userRepository.findById(ctx.db, userId)
  if (!user) throw errors.userNotFound()
  return toUserSummary(user)
}
