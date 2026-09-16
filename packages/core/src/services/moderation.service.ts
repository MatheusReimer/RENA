import type { ReportReason, ReportTarget } from '@revy/shared/constants'
import type { UserSummary } from '@revy/shared/types'
import { errors } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toUserSummary } from '../mappers'
import {
  discussionRepository,
  friendshipRepository,
  listRepository,
  moderationRepository,
  reviewRepository,
  userRepository,
} from '../repositories'

/**
 * Blocking and reporting.
 *
 * Required by both stores for an app carrying other people's writing, and the
 * reason they are required is worth keeping in mind while reading this: a
 * reader who meets something vile has to be able to act on it themselves,
 * without waiting for anybody. So both operations take effect immediately and
 * neither tells the other person anything.
 */
export const moderationService = {
  /**
   * Blocks somebody, in both directions.
   *
   * Blocking also ends the friendship, if there was one. Leaving it would put
   * the blocked person back in the friend list -- a list the blocker reads --
   * and in the friends-only audience of everything they post.
   *
   * Silent by design: no notification, and the blocked person sees the same
   * empty profile a stranger would. Telling somebody they have been blocked is
   * how blocking escalates.
   */
  async block(ctx: ServiceContext, targetUserId: string): Promise<void> {
    const auth = requireViewer(ctx)

    if (targetUserId === auth.viewerId) {
      throw errors.notFound('CANNOT_BLOCK_SELF', 'You cannot block yourself.')
    }

    const target = await userRepository.findById(auth.db, targetUserId)
    if (!target || target.deletedAt) throw errors.userNotFound()

    await moderationRepository.block(auth.db, auth.viewerId, targetUserId)

    const friendship = await friendshipRepository.findBetween(auth.db, auth.viewerId, targetUserId)
    if (friendship) await friendshipRepository.remove(auth.db, friendship.id)
  },

  async unblock(ctx: ServiceContext, targetUserId: string): Promise<void> {
    const auth = requireViewer(ctx)
    await moderationRepository.unblock(auth.db, auth.viewerId, targetUserId)
  },

  /** Who this viewer has blocked, for the list they can undo from. */
  async listBlocked(ctx: ServiceContext): Promise<UserSummary[]> {
    const auth = requireViewer(ctx)
    const rows = await moderationRepository.listBlocked(auth.db, auth.viewerId)
    return rows.map((row) => toUserSummary(row.user))
  },

  /**
   * Everyone invisible to this viewer, in both directions.
   *
   * Callers pass the result to queries as an exclusion list. It is one small
   * query per request and the result is usually empty, which is why it is not
   * cached anywhere: a stale block list shows somebody content they blocked.
   */
  async blockedIds(ctx: ServiceContext): Promise<string[]> {
    return moderationRepository.blockedIds(ctx.db, ctx.viewerId)
  },

  /**
   * Files a report.
   *
   * The reported thing is resolved to its author here rather than trusted from
   * the client, because the author is what a moderator acts on and a client
   * that can name anybody can get anybody suspended.
   *
   * Reporting the same thing twice returns quietly rather than erroring: the
   * reporter's intent is satisfied either way, and telling them "already
   * reported" only invites them to find another way to say it.
   */
  async report(
    ctx: ServiceContext,
    input: {
      targetType: ReportTarget
      targetId: string
      reason: ReportReason
      note?: string | null
    },
  ): Promise<{ filed: boolean; reportId: string | null; reportedUserId: string | null }> {
    const auth = requireViewer(ctx)

    const reportedUserId = await resolveAuthor(auth, input.targetType, input.targetId)

    if (reportedUserId === auth.viewerId) {
      throw errors.notFound('CANNOT_REPORT_SELF', 'You cannot report your own content.')
    }

    const report = await moderationRepository.createReport(auth.db, {
      reporterId: auth.viewerId,
      targetType: input.targetType,
      targetId: input.targetId,
      reportedUserId,
      reason: input.reason,
      note: input.note?.trim() || null,
    })

    return { filed: report !== null, reportId: report?.id ?? null, reportedUserId }
  },
}

/**
 * Who wrote the reported thing.
 *
 * Null rather than an error when it cannot be found: content deleted between
 * opening the report form and sending it is still worth recording, and a
 * report that fails because the thing vanished teaches people not to report.
 */
async function resolveAuthor(
  ctx: { db: ServiceContext['db'] },
  targetType: ReportTarget,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case 'user':
      return targetId
    case 'review': {
      const review = await reviewRepository.findById(ctx.db, targetId)
      return review?.userId ?? null
    }
    case 'comment': {
      const comment = await discussionRepository.findCommentById(ctx.db, targetId)
      return comment?.userId ?? null
    }
    case 'thread': {
      const thread = await discussionRepository.findThreadById(ctx.db, targetId)
      return thread?.userId ?? null
    }
    case 'list': {
      const list = await listRepository.findById(ctx.db, targetId)
      return list?.userId ?? null
    }
    /*
     * A direct message names no author here.
     *
     * Message bodies are encrypted at rest and a report is read by somebody
     * who is not in the conversation, so the mail carries the conversation and
     * the reporter rather than the text. The author is resolved by opening the
     * report, not by widening this.
     */
    case 'message':
      return null
    default:
      return null
  }
}
