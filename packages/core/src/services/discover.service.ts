import { BRAND, MEDIA_TYPES, MEDIA_TYPE_PLURALS } from '@revy/shared/constants'
import type {
  DiscoverItem,
  DiscoverSection,
  HomeSummary,
  MediaType,
  UserSummary,
} from '@revy/shared/types'
import { toScore } from '@revy/shared/utils'
import type { ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import {
  catalogueTotals,
  discoverRepository,
  friendshipRepository,
  mediaRepository,
  newReleases,
  recentlyAdded,
  similarToUserTaste,
  recentMembers,
  wallArtwork,
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

/**
 * Items per rail.
 *
 * The design shows a row that runs off the edge of the screen, so this is
 * sized to keep scrolling rather than to fit: at 7.5rem a card, twenty-four
 * is several screens wide on a phone and two on a desktop.
 */
const RAIL_SIZE = 24

/**
 * Tiles per media type on the home wall.
 *
 * Twelve of each fills a six-column grid to eight rows, which covers a
 * desktop opener with a little spare at the bottom edge -- the grid is meant
 * to run off the screen rather than end on a visible last row.
 */
const WALL_PER_TYPE = 12

/** Faces under the landing statement. Five is what the design shows. */
const FACE_PILE_SIZE = 5

export const discoverService = {
  /**
   * Artwork and figures for the home screen.
   *
   * Public: this is the signed-out landing screen as much as the signed-in
   * one, and it says nothing about any particular person.
   */
  async home(ctx: ServiceContext): Promise<HomeSummary> {
    const [rows, totals, members] = await Promise.all([
      wallArtwork(ctx.db, WALL_PER_TYPE),
      catalogueTotals(ctx.db),
      recentMembers(ctx.db, FACE_PILE_SIZE),
    ])

    return {
      // The query already filters on cover art, but the column is nullable and
      // the type should not claim otherwise downstream.
      tiles: rows
        .filter((row): row is typeof row & { coverImageUrl: string } =>
          Boolean(row.coverImageUrl),
        )
        .map((row) => ({
          id: row.id,
          title: row.title,
          coverImageUrl: row.coverImageUrl,
        })),
      members,
      ...totals,
    }
  },

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

    /*
     * One rail per media type, rather than rails that mix them.
     *
     * A row holding a film, a novel and a game together asks the reader to
     * re-orient at every card -- different shapes of thing, different reasons
     * to care. Splitting by type means a rail has one subject, and the heading
     * says what it is.
     *
     * The exceptions are the two rails about people. "Friends are watching" is
     * about whose taste it is, not what medium it is in, so mixing is the
     * point there.
     */
    const perType = await Promise.all(
      MEDIA_TYPES.map(async (mediaType) => {
        const plural = MEDIA_TYPE_PLURALS[mediaType].toLowerCase()
        const [trending, recent] = await Promise.all([
          this.trending(ctx, mediaType),
          newReleases(ctx.db, mediaType, RAIL_SIZE),
        ])

        // Steam supplies no release dates at list scale, so a release-ordered
        // rail of games is empty while the games themselves are right there.
        // Falling back to catalogue order keeps the rail useful and keeps the
        // heading truthful about what it is showing.
        const second = recent.length > 0
          ? { key: `new-${mediaType}`, title: `New ${plural}`, items: recent.map(toDiscoverItem) }
          : {
              key: `added-${mediaType}`,
              title: `More ${plural}`,
              items: (await recentlyAdded(ctx.db, mediaType, RAIL_SIZE)).map(toDiscoverItem),
            }

        return [
          {
            key: `trending-${mediaType}`,
            title: `Trending ${plural}`,
            items: trending,
          },
          second,
        ]
      }),
    )

    const [highestRated, friendsWatching, friendsRated, forYou] = await Promise.all([
      discoverRepository.highestRated(ctx.db, null, RAIL_SIZE),
      discoverRepository.friendsConsuming(ctx.db, friendIds, RAIL_SIZE * 3),
      discoverRepository.friendsRecentlyRated(ctx.db, friendIds, RAIL_SIZE * 3),
      ctx.viewerId
        ? similarToUserTaste(ctx.db, ctx.viewerId, RAIL_SIZE)
        : Promise.resolve([]),
    ])

    const sections: DiscoverSection[] = [
      // People first: whose taste it is beats what the catalogue holds.
      {
        key: 'friends-watching',
        title: 'Friends are watching',
        items: groupByMedia(friendsWatching),
      },
      {
        key: 'for-you',
        // Named for what it actually does. It is genre overlap with what the
        // viewer already rates highly -- not a model, and the heading should
        // not imply one (SPEC 21, 49.6).
        title: 'More in genres you rate highly',
        items: forYou
          // A title sharing no genres is not a suggestion, it is filler.
          .filter((row) => row.overlap > 0)
          .map(toDiscoverItem),
      },
      {
        key: 'highest-rated',
        title: `Highest rated on ${BRAND.name}`,
        items: highestRated.map(toDiscoverItem),
      },
      ...perType.flat(),
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
    const [trending, highestRated, recent, popular] = await Promise.all([
      this.trending(ctx, mediaType),
      discoverRepository.highestRated(ctx.db, mediaType, RAIL_SIZE),
      newReleases(ctx.db, mediaType, RAIL_SIZE),
      discoverRepository.popular(ctx.db, mediaType, RAIL_SIZE),
    ])

    const plural = MEDIA_TYPE_PLURALS[mediaType].toLowerCase()

    return [
      { key: `trending-${mediaType}`, title: `Trending ${plural}`, items: trending },
      {
        key: `new-${mediaType}`,
        title: `New ${plural}`,
        items: recent.map((row) => ({
          media: toMedia(row.media),
          averageRating: row.average === null ? null : Number(row.average),
          ratingCount: row.ratingCount ?? 0,
          friends: [],
        })),
      },
      {
        key: `popular-${mediaType}`,
        title: `Popular ${plural}`,
        items: popular.map((row) => ({
          media: toMedia(row.media),
          averageRating: row.average === null ? null : Number(row.average),
          ratingCount: row.ratingCount,
          friends: [],
        })),
      },
      {
        key: `top-${mediaType}`,
        title: `Highest rated ${plural}`,
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

/** Shapes a ranking row into a card. Repeated in every rail otherwise. */
function toDiscoverItem(row: {
  media: Parameters<typeof toMedia>[0]
  average: number | string | null
  ratingCount?: number | null
}): DiscoverItem {
  return {
    media: toMedia(row.media),
    averageRating: row.average === null ? null : Number(row.average),
    ratingCount: row.ratingCount ?? 0,
    friends: [],
  }
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
