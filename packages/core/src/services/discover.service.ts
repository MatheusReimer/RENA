import { BRAND, MEDIA_TYPE_LABELS } from '@revy/shared/constants'
import type { DiscoverItem, DiscoverSection, MediaType, UserSummary } from '@revy/shared/types'
import { toScore } from '@revy/shared/utils'
import type { ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import {
  discoverRepository,
  friendshipRepository,
  mediaRepository,
  similarToUserTaste,
} from '../repositories'
import { ProviderError } from '../providers'

/**
 * Discover (SPEC 21).
 *
 * Simple ranking and aggregation over rows we already have, exactly as SPEC 21
 * scopes it -- no recommendation model. Sections are assembled concurrently and
 * any that ends up empty is dropped, so the screen never shows a heading above
 * nothing.
 */

const RAIL_SIZE = 12

export const discoverService = {
  /**
   * Every Discover section the viewer can see.
   *
   * Friend sections are omitted entirely when signed out or friendless rather
   * than rendered empty -- a "Friends are watching" heading with no cards
   * reads as broken.
   */
  async getSections(ctx: ServiceContext): Promise<DiscoverSection[]> {
    const friendIds = ctx.viewerId
      ? await friendshipRepository.listFriendIds(ctx.db, ctx.viewerId)
      : []

    const [trending, popular, highestRated, friendsWatching, friendsRated, forYou] =
      await Promise.all([
        this.trending(ctx, null),
        discoverRepository.popular(ctx.db, null, RAIL_SIZE),
        discoverRepository.highestRated(ctx.db, null, RAIL_SIZE),
        discoverRepository.friendsConsuming(ctx.db, friendIds, RAIL_SIZE * 3),
        discoverRepository.friendsRecentlyRated(ctx.db, friendIds, RAIL_SIZE * 3),
        ctx.viewerId
          ? similarToUserTaste(ctx.db, ctx.viewerId, RAIL_SIZE)
          : Promise.resolve([]),
      ])

    const sections: DiscoverSection[] = [
      { key: 'trending', title: 'Trending this week', items: trending },
      {
        key: 'for-you',
        // Named for what it actually does. It is genre overlap with what the
        // viewer already rates highly -- not a model, and the heading should
        // not imply one (SPEC 21, 49.6).
        title: 'More in genres you rate highly',
        items: forYou
          // A title sharing no genres is not a suggestion, it is filler.
          .filter((row) => row.overlap > 0)
          .map((row) => ({
            media: toMedia(row.media),
            averageRating: row.average === null ? null : Number(row.average),
            ratingCount: row.ratingCount ?? 0,
            friends: [],
          })),
      },
      {
        key: 'popular',
        title: `Popular on ${BRAND.name}`,
        items: popular.map((row) => ({
          media: toMedia(row.media),
          averageRating: row.average === null ? null : Number(row.average),
          ratingCount: row.ratingCount,
          friends: [],
        })),
      },
      {
        key: 'highest-rated',
        title: 'Highest rated',
        items: highestRated.map((row) => ({
          media: toMedia(row.media),
          averageRating: row.average === null ? null : Number(row.average),
          ratingCount: row.ratingCount,
          friends: [],
        })),
      },
      {
        key: 'friends-watching',
        title: 'Friends are watching',
        items: groupByMedia(friendsWatching),
      },
      {
        key: 'friends-rated',
        title: 'Friends recently rated',
        items: groupByMedia(friendsRated),
      },
    ]

    return sections.filter((section) => section.items.length > 0)
  },

  /** One type's rail, for the per-type tabs on the search screen. */
  async getForType(ctx: ServiceContext, mediaType: MediaType): Promise<DiscoverSection[]> {
    const [trending, highestRated] = await Promise.all([
      this.trending(ctx, mediaType),
      discoverRepository.highestRated(ctx.db, mediaType, RAIL_SIZE),
    ])

    const label = MEDIA_TYPE_LABELS[mediaType].toLowerCase()

    return [
      { key: `trending-${mediaType}`, title: `Trending ${label}s`, items: trending },
      {
        key: `top-${mediaType}`,
        title: `Highest rated ${label}s`,
        items: highestRated.map((row) => ({
          media: toMedia(row.media),
          averageRating: row.average === null ? null : Number(row.average),
          ratingCount: row.ratingCount,
          friends: [],
        })),
      },
    ].filter((section) => section.items.length > 0)
  },

  /**
   * Trending, preferring local activity and topping up from the provider.
   *
   * A new install has no ratings yet, so local trending would be empty on day
   * one. Provider trending fills the gap and those titles are persisted as
   * they arrive, which is also how the catalogue seeds itself over time.
   */
  async trending(ctx: ServiceContext, mediaType: MediaType | null): Promise<DiscoverItem[]> {
    const local = await discoverRepository.trending(ctx.db, mediaType, RAIL_SIZE)

    const items: DiscoverItem[] = local.map((row) => ({
      media: toMedia(row.media),
      averageRating: row.average === null ? null : Number(row.average),
      ratingCount: row.recentRatings,
      friends: [],
    }))

    if (items.length >= RAIL_SIZE) return items

    const remote = await fetchProviderTrending(ctx, mediaType, RAIL_SIZE - items.length)
    const seen = new Set(items.map((item) => item.media.id))

    return [...items, ...remote.filter((item) => !seen.has(item.media.id))].slice(0, RAIL_SIZE)
  },
}

/**
 * Pulls trending from the configured providers and persists what comes back.
 *
 * A provider failure yields nothing rather than failing the screen: Discover
 * degrades to whatever local activity exists.
 */
async function fetchProviderTrending(
  ctx: ServiceContext,
  mediaType: MediaType | null,
  limit: number,
): Promise<DiscoverItem[]> {
  if (limit <= 0) return []

  const types: MediaType[] = mediaType ? [mediaType] : ['movie', 'series']
  const items: DiscoverItem[] = []

  for (const type of types) {
    const provider = ctx.providers.forType(type)
    if (!provider?.getTrending) continue

    try {
      const results = await provider.getTrending(type, limit)

      for (const result of results.slice(0, limit)) {
        // Resolving persists the title, so a trending row becomes something
        // that can be rated without a second lookup later.
        const details = await provider.getByExternalId(result.externalId, type)
        if (!details) continue

        const row = await mediaRepository.upsertFromProvider(ctx.db, details)
        items.push({
          media: toMedia(row),
          averageRating: null,
          ratingCount: 0,
          friends: [],
        })
      }
    } catch (error) {
      // Never let a catalogue outage empty the whole screen.
      if (!(error instanceof ProviderError)) throw error
    }
  }

  return items.slice(0, limit)
}

/**
 * Collapses per-friend rows into one card per title, carrying the friends.
 *
 * Preserves the query's ordering: the first time a title appears is the most
 * recent activity on it.
 */
function groupByMedia(
  rows: Array<{
    media: Parameters<typeof toMedia>[0]
    user: Parameters<typeof toUserSummary>[0]
    score?: number
  }>,
): DiscoverItem[] {
  const byMedia = new Map<string, DiscoverItem>()

  for (const row of rows) {
    const existing = byMedia.get(row.media.id)
    const friend: UserSummary = toUserSummary(row.user)

    if (existing) {
      // The same friend can appear twice (rated and watching); keep one.
      if (!existing.friends.some((f) => f.id === friend.id)) {
        existing.friends.push(friend)
      }
      continue
    }

    byMedia.set(row.media.id, {
      media: toMedia(row.media),
      averageRating: row.score === undefined ? null : toScore(row.score),
      ratingCount: 0,
      friends: [friend],
    })
  }

  return [...byMedia.values()].slice(0, RAIL_SIZE)
}
