import type { RespondToFriendRequestInput } from '@revy/shared/schemas'
import type { FriendRequest, FriendshipState, UserSummary } from '@revy/shared/types'
import { errors } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toUserSummary } from '../mappers'
import {
  friendshipRepository,
  notificationRepository,
  userRepository,
} from '../repositories'
import { badgeService } from './badge.service'

/**
 * The friend graph (SPEC 12).
 *
 * Every state transition is validated against the current row rather than
 * trusted from the client: SPEC 12 requires duplicate relationships be
 * impossible and the relationship work regardless of who initiated it.
 */
export const friendshipService = {
  /**
   * Sends a friend request (SPEC 12).
   *
   * Re-sending after a rejection is allowed -- people change their minds --
   * but it reuses the existing row rather than inserting a second one, which
   * the pair unique index would reject anyway.
   */
  async sendRequest(ctx: ServiceContext, targetUserId: string): Promise<FriendshipState> {
    const auth = requireViewer(ctx)

    if (targetUserId === auth.viewerId) {
      throw errors.notFound('CANNOT_FRIEND_SELF', 'You cannot add yourself as a friend.')
    }

    const target = await userRepository.findById(auth.db, targetUserId)
    if (!target || target.deletedAt) throw errors.userNotFound()

    /*
     * A blocked pair cannot become friends, in either direction, and the
     * refusal is the same "no such person" a stranger would get -- for the
     * same reason the profile is: a request that fails differently is a way to
     * find out you have been blocked.
     */
    if (auth.blockedUserIds.includes(targetUserId)) throw errors.userNotFound()

    const existing = await friendshipRepository.findBetween(auth.db, auth.viewerId, targetUserId)

    if (existing) {
      if (existing.status === 'accepted') {
        throw errors.notFound('ALREADY_FRIENDS', 'You are already friends.')
      }
      if (existing.status === 'blocked') {
        // Deliberately indistinguishable from a normal failure, so blocking
        // cannot be detected by probing.
        throw errors.forbidden('You cannot send a request to this user.')
      }
      if (existing.status === 'pending') {
        // The other person already asked: treat this as an accept rather than
        // leaving two people waiting on each other.
        if (existing.receiverId === auth.viewerId) {
          return this.respond(ctx, existing.id, { action: 'accept' })
        }
        throw errors.notFound('FRIEND_REQUEST_EXISTS', 'A request is already pending.')
      }

      // Previously rejected: reopen the same row.
      const reopened = await friendshipRepository.updateStatus(auth.db, existing.id, 'pending')
      await notifyRequest(ctx, targetUserId, auth.viewerId, existing.id)
      return {
        status: 'pending',
        isOutgoing: reopened?.requesterId === auth.viewerId,
        friendshipId: existing.id,
      }
    }

    const created = await friendshipRepository.create(auth.db, auth.viewerId, targetUserId)
    if (!created) {
      // Lost a race against a concurrent request; report the real state.
      const current = await friendshipRepository.findBetween(auth.db, auth.viewerId, targetUserId)
      return toFriendshipState(current, auth.viewerId)
    }

    await notifyRequest(ctx, targetUserId, auth.viewerId, created.id)

    return { status: 'pending', isOutgoing: true, friendshipId: created.id }
  },

  /** Accepts or rejects an incoming request. Only the receiver may (SPEC 27). */
  async respond(
    ctx: ServiceContext,
    friendshipId: string,
    input: RespondToFriendRequestInput,
  ): Promise<FriendshipState> {
    const auth = requireViewer(ctx)

    const friendship = await friendshipRepository.findById(auth.db, friendshipId)
    if (!friendship) throw errors.notFound('NOT_FOUND', 'Friend request not found.')

    if (friendship.receiverId !== auth.viewerId) {
      throw errors.forbidden('Only the person who received a request can respond to it.')
    }
    if (friendship.status !== 'pending') {
      throw errors.notFound('CONFLICT', 'That request is no longer pending.')
    }

    const status = input.action === 'accept' ? 'accepted' : 'rejected'
    await friendshipRepository.updateStatus(auth.db, friendshipId, status)

    if (status === 'accepted') {
      await notificationRepository.create(auth.db, {
        userId: friendship.requesterId,
        type: 'friend_request_accepted',
        actorId: auth.viewerId,
        entityId: friendshipId,
        context: {},
      })

      // Both sides just gained a friend, so both may have earned a badge.
      await badgeService.evaluate(auth.db, auth.viewerId, 'friendship')
      await badgeService.evaluate(auth.db, friendship.requesterId, 'friendship')
    }

    return {
      status,
      isOutgoing: false,
      friendshipId,
    }
  },

  /**
   * Cancels a pending outgoing request, or removes an existing friend.
   * Either party may remove an accepted friendship.
   */
  async remove(ctx: ServiceContext, targetUserId: string): Promise<void> {
    const auth = requireViewer(ctx)

    const friendship = await friendshipRepository.findBetween(auth.db, auth.viewerId, targetUserId)
    if (!friendship) return

    const involved =
      friendship.requesterId === auth.viewerId || friendship.receiverId === auth.viewerId
    if (!involved) throw errors.forbidden('You are not part of that friendship.')

    await friendshipRepository.remove(auth.db, friendship.id)
  },

  /** The viewer's relationship to another user, as the UI needs it. */
  async getState(ctx: ServiceContext, targetUserId: string): Promise<FriendshipState | null> {
    if (!ctx.viewerId || ctx.viewerId === targetUserId) return null
    const friendship = await friendshipRepository.findBetween(ctx.db, ctx.viewerId, targetUserId)
    return toFriendshipState(friendship, ctx.viewerId)
  },

  async listFriends(ctx: ServiceContext, userId: string): Promise<UserSummary[]> {
    const rows = await friendshipRepository.listFriends(ctx.db, userId)
    return rows.map((row) => toUserSummary(row.user))
  },

  async listIncomingRequests(ctx: ServiceContext): Promise<FriendRequest[]> {
    const auth = requireViewer(ctx)
    const rows = await friendshipRepository.listIncomingRequests(auth.db, auth.viewerId)
    return rows.map((row) => ({
      id: row.friendship.id,
      user: toUserSummary(row.user),
      createdAt: row.friendship.createdAt.toISOString(),
    }))
  },

  async listOutgoingRequests(ctx: ServiceContext): Promise<FriendRequest[]> {
    const auth = requireViewer(ctx)
    const rows = await friendshipRepository.listOutgoingRequests(auth.db, auth.viewerId)
    return rows.map((row) => ({
      id: row.friendship.id,
      user: toUserSummary(row.user),
      createdAt: row.friendship.createdAt.toISOString(),
    }))
  },
}

function toFriendshipState(
  friendship: { id: string; requesterId: string; status: string } | null,
  viewerId: string,
): FriendshipState {
  if (!friendship) return { status: 'none', isOutgoing: false, friendshipId: null }
  return {
    status: friendship.status as FriendshipState['status'],
    isOutgoing: friendship.requesterId === viewerId,
    friendshipId: friendship.id,
  }
}

/**
 * Tells somebody a request is waiting (SPEC 12, 23).
 *
 * `friendshipId` is the load-bearing argument. The notifications screen offers
 * Accept and Reject inline, and it renders those buttons only when the
 * notification carries the id they would act on -- so a notification written
 * without one is delivered, counted in the badge, and then inert: the reader
 * sees "ana sent you a friend request" with nothing to press, and has to go
 * find the profile to respond. That is exactly what this did until it was
 * caught by a test that followed the notification through to the accept.
 *
 * `friend_request_accepted` has always set it. These two are a pair and are
 * written the same way for that reason.
 */
async function notifyRequest(
  ctx: ServiceContext,
  recipientId: string,
  actorId: string,
  friendshipId: string,
): Promise<void> {
  await notificationRepository.create(ctx.db, {
    userId: recipientId,
    type: 'friend_request',
    actorId,
    entityId: friendshipId,
    context: {},
  })
}
