import type {
  CommunityDetail,
  CommunityMember,
  CommunitySummary,
} from '@revy/shared/types'
import { errors } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import {
  communityRepository,
  discussionRepository,
  mediaRepository,
} from '../repositories'

/**
 * Communities (SPEC 14).
 *
 * Every media item is a community -- there is nothing to create, and no
 * separate record. A title becomes a place the moment someone starts talking
 * about it, and joining is what turns a comment section into somewhere you
 * belong.
 */

const MEMBER_PAGE = 30

export const communityService = {
  /**
   * Communities ranked by how alive they are.
   *
   * Driven by discussion activity rather than member count: a community with
   * a thousand silent members is not somewhere to send anyone.
   */
  async listActive(ctx: ServiceContext, limit = 20): Promise<CommunitySummary[]> {
    const rows = await communityRepository.listActive(ctx.db, limit)
    if (rows.length === 0) return []

    const mediaIds = rows.map((row) => row.media.id)

    const [memberCounts, memberships] = await Promise.all([
      communityRepository.memberCounts(ctx.db, mediaIds),
      ctx.viewerId
        ? communityRepository.membershipsFor(ctx.db, ctx.viewerId, mediaIds)
        : Promise.resolve(new Set<string>()),
    ])

    return rows.map((row) => ({
      media: toMedia(row.media),
      memberCount: memberCounts.get(row.media.id) ?? 0,
      threadCount: row.threadCount,
      replyCount: row.replyCount,
      joined: ctx.viewerId ? memberships.has(row.media.id) : null,
      lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
    }))
  },

  /** The communities the viewer has joined. */
  async listJoined(ctx: ServiceContext, limit = 20): Promise<CommunitySummary[]> {
    const auth = requireViewer(ctx)

    const rows = await communityRepository.listJoined(auth.db, auth.viewerId, limit)
    if (rows.length === 0) return []

    const mediaIds = rows.map((row) => row.media.id)
    const [memberCounts, threadCounts] = await Promise.all([
      communityRepository.memberCounts(auth.db, mediaIds),
      discussionRepository.countThreadsForManyMedia(auth.db, mediaIds),
    ])

    return rows.map((row) => ({
      media: toMedia(row.media),
      memberCount: memberCounts.get(row.media.id) ?? 0,
      threadCount: threadCounts.get(row.media.id) ?? 0,
      replyCount: 0,
      joined: true,
      lastActivityAt: row.joinedAt.toISOString(),
    }))
  },

  /** One community, with a page of members (SPEC 14). */
  async get(ctx: ServiceContext, mediaId: string): Promise<CommunityDetail> {
    const media = await mediaRepository.findById(ctx.db, mediaId)
    if (!media) throw errors.mediaNotFound()

    const [memberCounts, threadCounts, memberRows, joined] = await Promise.all([
      communityRepository.memberCounts(ctx.db, [mediaId]),
      discussionRepository.countThreadsForManyMedia(ctx.db, [mediaId]),
      communityRepository.listMembers(ctx.db, mediaId, MEMBER_PAGE),
      ctx.viewerId
        ? communityRepository.isMember(ctx.db, mediaId, ctx.viewerId)
        : Promise.resolve(null),
    ])

    const members: CommunityMember[] = memberRows.map((row) => ({
      user: toUserSummary(row.user),
      joinedAt: row.joinedAt.toISOString(),
    }))

    return {
      media: toMedia(media),
      memberCount: memberCounts.get(mediaId) ?? 0,
      threadCount: threadCounts.get(mediaId) ?? 0,
      replyCount: 0,
      joined,
      lastActivityAt: null,
      members,
    }
  },

  /**
   * Joins a community. Idempotent -- joining twice is success, not an error,
   * because the caller ends up in the state they asked for either way.
   */
  async join(ctx: ServiceContext, mediaId: string): Promise<{ joined: true; memberCount: number }> {
    const auth = requireViewer(ctx)

    const media = await mediaRepository.findById(auth.db, mediaId)
    if (!media) throw errors.mediaNotFound()

    await communityRepository.join(auth.db, mediaId, auth.viewerId)
    const counts = await communityRepository.memberCounts(auth.db, [mediaId])

    return { joined: true, memberCount: counts.get(mediaId) ?? 1 }
  },

  async leave(ctx: ServiceContext, mediaId: string): Promise<{ joined: false; memberCount: number }> {
    const auth = requireViewer(ctx)

    await communityRepository.leave(auth.db, mediaId, auth.viewerId)
    const counts = await communityRepository.memberCounts(auth.db, [mediaId])

    return { joined: false, memberCount: counts.get(mediaId) ?? 0 }
  },
}
