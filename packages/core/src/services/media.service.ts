import type { MediaSearchInput, ResolveMediaInput } from '@revy/shared/schemas'
import type {
  Media,
  MediaDetail,
  MediaSearchResult,
  MediaType,
  ViewerMediaState,
} from '@revy/shared/types'
import { errors, toScore } from '@revy/shared/utils'
import type { ServiceContext } from '../context'
import { toMedia, toRatingSummary, toUserSummary } from '../mappers'
import { ProviderError } from '../providers'
import {
  friendshipRepository,
  mediaRepository,
  ratingRepository,
  reviewRepository,
} from '../repositories'

/**
 * Media search, resolution and detail (SPEC 7, 8, 19, 20).
 *
 * The rest of the application asks this service for media and never touches a
 * provider (SPEC 49.2). Provider results become local `media` rows the moment
 * a user acts on one, which is what gives ratings something stable to point at.
 */
export const mediaService = {
  /**
   * Global media search (SPEC 20).
   *
   * Queries local rows and the providers together. Local hits are returned
   * with their real ids so the client can link straight to a media page;
   * provider-only hits carry `id: null` and are resolved on first interaction.
   */
  async search(ctx: ServiceContext, input: MediaSearchInput): Promise<MediaSearchResult[]> {
    const query = input.q.trim()
    if (query.length === 0) return []

    const [local, remote] = await Promise.all([
      mediaRepository.searchLocal(ctx.db, query, input.type, input.limit),
      ctx.providers.searchAll(query, input.limit, input.type),
    ])

    const results: MediaSearchResult[] = []
    // Keyed by provider + external id, so a local row and the provider result
    // for the same title collapse into one entry -- with the local id kept.
    const seen = new Set<string>()

    for (const row of local) {
      seen.add(`${row.provider}:${row.externalId}`)
      results.push({
        id: row.id,
        externalId: row.externalId,
        provider: row.provider,
        mediaType: row.mediaType,
        title: row.title,
        releaseDate: row.releaseDate,
        coverImageUrl: row.coverImageUrl,
        subtitle: subtitleFor(row.mediaType, row.metadata),
      })
    }

    for (const item of remote.results) {
      const key = `${item.provider}:${item.externalId}`
      if (seen.has(key)) continue
      seen.add(key)
      results.push({
        id: null,
        externalId: item.externalId,
        provider: item.provider,
        mediaType: item.mediaType,
        title: item.title,
        releaseDate: item.releaseDate,
        coverImageUrl: item.coverImageUrl,
        subtitle: item.subtitle,
      })
    }

    return results.slice(0, input.limit)
  },

  /**
   * Turns a provider result into a local media row, or returns the existing
   * one. Idempotent, and the only way media enters the database.
   */
  async resolve(ctx: ServiceContext, input: ResolveMediaInput): Promise<Media> {
    const provider = ctx.providers.forType(input.mediaType)
    if (!provider) throw errors.mediaNotFound()

    const existing = await mediaRepository.findByExternal(
      ctx.db,
      provider.key,
      input.externalId,
      input.mediaType,
    )
    // A row that was fetched recently is served as-is; re-fetching provider
    // details on every open would burn rate limit for no benefit.
    if (existing && isFresh(existing.syncedAt)) return toMedia(existing)

    let details
    try {
      details = await provider.getByExternalId(input.externalId, input.mediaType)
    } catch (error) {
      if (error instanceof ProviderError) {
        // A provider outage must not break a title we already have locally.
        if (existing) return toMedia(existing)
        throw errors.providerUnavailable(provider.key)
      }
      throw error
    }

    if (!details) {
      if (existing) return toMedia(existing)
      throw errors.mediaNotFound()
    }

    const row = await mediaRepository.upsertFromProvider(ctx.db, details)
    return toMedia(row)
  },

  async getById(ctx: ServiceContext, mediaId: string): Promise<Media> {
    const row = await mediaRepository.findById(ctx.db, mediaId)
    if (!row) throw errors.mediaNotFound()
    return toMedia(row)
  },

  /**
   * The full media page payload (SPEC 19).
   *
   * Ordered as SPEC 19 prioritises it: the media itself, the viewer's own
   * state, then friends, then community. Everything is gathered concurrently
   * because none of it depends on the rest.
   */
  async getDetail(ctx: ServiceContext, mediaId: string): Promise<MediaDetail> {
    const row = await mediaRepository.findById(ctx.db, mediaId)
    if (!row) throw errors.mediaNotFound()

    const [stats, reviewCount, viewerState, friendRatings] = await Promise.all([
      mediaRepository.getRatingStats(ctx.db, mediaId),
      reviewRepository.countForMedia(ctx.db, mediaId),
      loadViewerState(ctx, mediaId),
      loadFriendRatings(ctx, mediaId),
    ])

    return {
      ...toMedia(row),
      ratingSummary: toRatingSummary(stats),
      viewerState,
      friendRatings,
      reviewCount,
      // Discussion counts arrive with Phase 5; the field exists now so the
      // client contract does not change when they do.
      discussionCount: 0,
    }
  },
}

/** The viewer's own rating, status and review flags for a media item. */
async function loadViewerState(
  ctx: ServiceContext,
  mediaId: string,
): Promise<ViewerMediaState | null> {
  if (!ctx.viewerId) return null

  const [rating, status, review] = await Promise.all([
    ratingRepository.find(ctx.db, ctx.viewerId, mediaId),
    ratingRepository.findStatus(ctx.db, ctx.viewerId, mediaId),
    reviewRepository.findByUserAndMedia(ctx.db, ctx.viewerId, mediaId),
  ])

  return {
    status: status?.status ?? null,
    score: rating ? toScore(rating.score) : null,
    hasReview: review !== null,
    // Populated with Phase 6 lists; empty is the correct answer until then.
    inListIds: [],
  }
}

/** Friends who have rated this media (SPEC 19). */
async function loadFriendRatings(ctx: ServiceContext, mediaId: string) {
  if (!ctx.viewerId) return []

  const friendIds = await friendshipRepository.listFriendIds(ctx.db, ctx.viewerId)
  if (friendIds.length === 0) return []

  const rows = await ratingRepository.findByUsersForMedia(ctx.db, friendIds, mediaId)

  return rows.map((row) => ({
    user: toUserSummary(row.user),
    score: toScore(row.rating.score),
    status: row.status ?? null,
    ratedAt: row.rating.createdAt.toISOString(),
  }))
}

/** Provider data older than a week is refetched on next open. */
const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000

function isFresh(syncedAt: Date | null): boolean {
  return syncedAt !== null && Date.now() - syncedAt.getTime() < FRESHNESS_MS
}

/** The secondary line on a search result: author for books, genre otherwise. */
function subtitleFor(mediaType: MediaType, metadata: Record<string, unknown>): string | null {
  if (mediaType === 'book') {
    const authors = metadata.authors
    if (Array.isArray(authors) && typeof authors[0] === 'string') return authors[0]
    return null
  }
  const genres = metadata.genres
  if (Array.isArray(genres) && typeof genres[0] === 'string') return genres[0]
  return null
}
