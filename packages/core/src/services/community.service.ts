import type {
  CommunityDetail,
  CommunityMember,
  CommunitySummary,
} from '@revy/shared/types'
import { PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import { errors } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import {
  communityRepository,
  discussionRepository,
  friendshipRepository,
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

/** Faces on a card before it turns into "+N". */
const FRIEND_FACES = 3

/** A directory row, as both listing queries return it. */
type DirectoryRow = {
  media: Parameters<typeof toMedia>[0]
  memberCount: number
  threadCount: number
  replyCount: number
  lastActivityAt: Date | string | null
}

/**
 * Adds the one thing the query cannot know: whether *this* reader has joined.
 *
 * Shared by both listings so they cannot drift in what they report. Signed
 * out, `joined` is null rather than false -- the card needs to tell "you are
 * not a member" apart from "we do not know who you are", because only one of
 * those should render a Join button.
 */
async function decorate(
  ctx: ServiceContext,
  rows: DirectoryRow[],
): Promise<CommunitySummary[]> {
  if (rows.length === 0) return []

  const mediaIds = rows.map((row) => row.media.id)
  const memberships = ctx.viewerId
    ? await communityRepository.membershipsFor(ctx.db, ctx.viewerId, mediaIds)
    : new Set<string>()

  return rows.map((row) => ({
    media: toMedia(row.media),
    memberCount: row.memberCount,
    threadCount: row.threadCount,
    replyCount: row.replyCount,
    joined: ctx.viewerId ? memberships.has(row.media.id) : null,
    lastActivityAt: row.lastActivityAt ? new Date(row.lastActivityAt).toISOString() : null,
  }))
}

export const communityService = {
  /**
   * Communities ranked by how alive they are -- somewhere to go *now*.
   *
   * Counts joining as well as talking; see the repository for why listing only
   * what had threads made a member-only community undiscoverable.
   */
  async listActive(
    ctx: ServiceContext,
    limit = PAGE_SIZE_DEFAULT,
    query?: string,
  ): Promise<CommunitySummary[]> {
    return decorate(ctx, await communityRepository.listActive(ctx.db, limit, query))
  },

  /**
   * The whole catalogue as a joinable directory (SPEC 14).
   *
   * Every title is a community from the moment it enters the catalogue, so
   * this needs no `created` state to filter on -- it is the catalogue, ordered
   * by how many people have gathered there.
   *
   * Public, like `listActive`: you have to be able to see a community before
   * deciding to join it.
   */
  async listBrowse(
    ctx: ServiceContext,
    limit = PAGE_SIZE_DEFAULT,
    offset = 0,
    query?: string,
  ): Promise<CommunitySummary[]> {
    return decorate(ctx, await communityRepository.listBrowse(ctx.db, limit, offset, query))
  },

  /**
   * Communities the viewer's friends have joined (SPEC 12, 14).
   *
   * Needs a session, unlike the other two listings -- there is no such thing
   * as a signed-out friend list. Returns nothing rather than falling back to
   * something popular when the viewer has no friends: an empty state that says
   * so is useful, and a silent substitution would misreport whose communities
   * these are.
   */
  async listFriends(
    ctx: ServiceContext,
    limit = PAGE_SIZE_DEFAULT,
    query?: string,
  ): Promise<CommunitySummary[]> {
    const auth = requireViewer(ctx)

    const friendIds = await friendshipRepository.listFriendIds(auth.db, auth.viewerId)
    if (friendIds.length === 0) return []

    const rows = await communityRepository.listFriends(auth.db, friendIds, limit, query)
    if (rows.length === 0) return []

    const [summaries, faces] = await Promise.all([
      decorate(ctx, rows),
      communityRepository.friendMembersFor(
        auth.db,
        friendIds,
        rows.map((row) => row.media.id),
      ),
    ])

    const byMedia = new Map<string, typeof faces>()
    for (const face of faces) {
      const list = byMedia.get(face.mediaId)
      if (list) list.push(face)
      else byMedia.set(face.mediaId, [face])
    }

    return summaries.map((summary, index) => ({
      ...summary,
      /*
       * Capped at the number the card can show without wrapping. The full
       * count travels separately, so "+4" stays accurate rather than being
       * derived from a truncated list.
       */
      friendMembers: (byMedia.get(summary.media.id) ?? [])
        .slice(0, FRIEND_FACES)
        .map((face) => toUserSummary(face.user)),
      friendCount: rows[index]!.friendCount,
    }))
  },

  /** The communities the viewer has joined. */
  async listJoined(
    ctx: ServiceContext,
    limit = PAGE_SIZE_DEFAULT,
    query?: string,
  ): Promise<CommunitySummary[]> {
    const auth = requireViewer(ctx)

    const rows = await communityRepository.listJoined(auth.db, auth.viewerId, limit, query)
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
