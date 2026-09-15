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
import { toCommunityReview, toMedia, toTrendingTile, toUserSummary } from '../mappers'
import {
  catalogueTotals,
  communityReviews,
  discoverRepository,
  friendshipRepository,
  newReleases,
  recentlyAdded,
  recentlyReviewed,
  recommendedForUser,
  similarToUserTaste,
  recentMembers,
} from '../repositories'

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
 * Posters on the landing screen's rail.
 *
 * The rail scrolls, so this is sized to run off the edge rather than to fit:
 * twelve is about two screens wide on a desktop, which is enough to make the
 * overflow obvious without shipping a whole catalogue to a visitor who has not
 * signed up yet.
 */
const LANDING_RAIL_SIZE = 12

/** Faces under the landing statement. Three is what the design shows. */
const FACE_PILE_SIZE = 3

/** Review cards drawn in the community section. */
const COMMUNITY_REVIEW_COUNT = 4

/**
 * How many are fetched to fill those cards.
 *
 * More than are shown, because the next step throws some away: two people can
 * write the same sentence about the same film, and seeded data does it
 * constantly. Over-fetching means deduplicating never leaves the row short.
 */
const COMMUNITY_REVIEW_POOL = 16

/**
 * The same opinion, twice, is worse than one opinion.
 *
 * This section's entire claim is "real people, real perspectives", and two
 * cards side by side reading identically refutes it more convincingly than
 * the heading asserts it. Compared on normalised text rather than on id,
 * because the duplicates that matter are different rows saying the same
 * thing -- the same author writing about two different films is fine and
 * stays.
 */
function distinctByQuote<T extends { quote: string }>(reviews: T[], limit: number): T[] {
  const seen = new Set<string>()
  const kept: T[] = []

  for (const review of reviews) {
    if (kept.length >= limit) break

    const key = review.quote.trim().toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue

    seen.add(key)
    kept.push(review)
  }

  return kept
}

export const discoverService = {
  /**
   * Everything the landing screen shows.
   *
   * Public, and deliberately so: it says nothing about any particular person,
   * which is what lets it be the same response for every visitor and therefore
   * cacheable at the edge later without any of this changing.
   */
  async home(ctx: ServiceContext): Promise<HomeSummary> {
    const [trending, totals, members, reviews] = await Promise.all([
      recentlyReviewed(ctx.db, LANDING_RAIL_SIZE),
      catalogueTotals(ctx.db),
      recentMembers(ctx.db, FACE_PILE_SIZE),
      communityReviews(ctx.db, COMMUNITY_REVIEW_POOL),
    ])

    return {
      trending: trending.map(toTrendingTile),
      members,
      // Mapped before deduplicating, not after: the mapper is what trims a
      // review to its quote, and two reviews that differ only past the trim
      // would still land on the page as two identical cards.
      reviews: distinctByQuote(reviews.map(toCommunityReview), COMMUNITY_REVIEW_COUNT),
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
          ? {
              key: `new-${mediaType}`,
              title: `New ${plural}`,
              titleKey: 'discover.newOfType',
              titleParams: { type: plural },
              items: recent.map(toDiscoverItem),
            }
          : {
              key: `added-${mediaType}`,
              title: `More ${plural}`,
              titleKey: 'discover.moreOfType',
              titleParams: { type: plural },
              items: (await recentlyAdded(ctx.db, mediaType, RAIL_SIZE)).map(toDiscoverItem),
            }

        return [
          {
            key: `trending-${mediaType}`,
            title: `Trending ${plural}`,
            titleKey: 'discover.trendingOfType',
            titleParams: { type: plural },
            items: trending,
          },
          second,
        ]
      }),
    )

    const [highestRated, friendsWatching, friendsRated, forYou, recommended] =
      await Promise.all([
        discoverRepository.highestRated(ctx.db, null, RAIL_SIZE),
        discoverRepository.friendsConsuming(ctx.db, friendIds, RAIL_SIZE * 3),
        discoverRepository.friendsRecentlyRated(ctx.db, friendIds, RAIL_SIZE * 3),
        ctx.viewerId
          ? similarToUserTaste(ctx.db, ctx.viewerId, RAIL_SIZE)
          : Promise.resolve([]),
        ctx.viewerId
          ? recommendedForUser(ctx.db, ctx.viewerId, RAIL_SIZE)
          : Promise.resolve([]),
      ])

    const sections: DiscoverSection[] = [
      // People first: whose taste it is beats what the catalogue holds.
      {
        key: 'friends-watching',
        title: 'Friends are watching',
        titleKey: 'discover.friendsWatching',
        items: groupByMedia(friendsWatching),
      },
      /*
       * Two rails, and which one appears depends on what we actually know.
       *
       * `recommended` is the real recommender: who else liked it, weighted
       * towards friends. It needs the viewer to have rated something or to
       * have friends who have, so it is empty for a brand-new account -- and
       * an empty rail is worse than no rail.
       *
       * `for-you` is the genre-overlap fallback, unchanged and still honestly
       * named. It needs nothing but one rating and some metadata, so it covers
       * exactly the case the recommender cannot.
       *
       * They are never both shown. Two adjacent rails of suggestions is a
       * screen that has stopped having an opinion.
       */
      ...(recommended.length > 0
        ? [
            {
              key: 'recommended',
              // This one has earned the name: it is other people's ratings,
              // not a tag match.
              title: 'Because of what you and your friends rate',
              titleKey: 'discover.recommended',
              items: recommended.map(toRecommendedItem),
            },
          ]
        : [
            {
              key: 'for-you',
              // Named for what it actually does. It is genre overlap with what
              // the viewer already rates highly -- not a model, and the
              // heading should not imply one (SPEC 21, 49.6).
              title: 'More in genres you rate highly',
              titleKey: 'discover.forYou',
              items: forYou
                // A title sharing no genres is not a suggestion, it is filler.
                .filter((row) => row.overlap > 0)
                .map(toDiscoverItem),
            },
          ]),
      {
        key: 'highest-rated',
        title: `Highest rated on ${BRAND.name}`,
        titleKey: 'discover.highestRated',
        titleParams: { brand: BRAND.name },
        items: highestRated.map(toDiscoverItem),
      },
      ...perType.flat(),
      {
        key: 'friends-rated',
        title: 'Friends recently rated',
        titleKey: 'discover.friendsRated',
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
      {
        key: `trending-${mediaType}`,
        title: `Trending ${plural}`,
        titleKey: 'discover.trendingOfType',
        titleParams: { type: plural },
        items: trending,
      },
      {
        key: `new-${mediaType}`,
        title: `New ${plural}`,
        titleKey: 'discover.newOfType',
        titleParams: { type: plural },
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
        titleKey: 'discover.popularOfType',
        titleParams: { type: plural },
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
        titleKey: 'discover.topOfType',
        titleParams: { type: plural },
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
   * What this community has been rating lately. Local activity, nothing else.
   *
   * This used to top up a short rail from TMDB and RAWG -- and for every
   * result it fetched, it made a *second* provider request for the full record
   * and wrote it to the database. Sequentially, in a loop, on a GET. Across
   * four media types that was around forty external round trips per page load,
   * and it is the whole reason Discover and Search took eight to fourteen
   * seconds: every local query behind that endpoint adds up to under half a
   * second. Removing it took the endpoint from 8.2s to 0.04s.
   *
   * It made sense exactly once, when the catalogue was empty and the screen
   * would otherwise have been blank. With two thousand titles imported it was
   * pure cost -- and a read that quietly writes rows, whose latency depends on
   * somebody else's API being up, was never the right shape for a page load.
   * Filling the catalogue is `pnpm db:import`'s job.
   *
   * Nothing replaced it, deliberately. A short rail is the truth: if fifteen
   * titles have been rated recently then fifteen is what "trending" means
   * today, and padding it with catalogue filler would put titles nobody has
   * touched under a heading claiming they are what people are watching. A type
   * with no recent activity at all drops its rail entirely, which the empty
   * filter above already handles.
   */
  async trending(ctx: ServiceContext, mediaType: MediaType | null): Promise<DiscoverItem[]> {
    const local = await discoverRepository.trending(ctx.db, mediaType, RAIL_SIZE)

    const items: DiscoverItem[] = local.map((row) => ({
      media: toMedia(row.media),
      averageRating: row.average === null ? null : Number(row.average),
      ratingCount: row.recentRatings,
      friends: [],
    }))

    return items
  },
}

/** Shapes a ranking row into a card. Repeated in every rail otherwise. */
/**
 * A recommendation, carrying why it is here.
 *
 * The reason travels as counts and names so the client can phrase it; see
 * `RecommendationReason`. Null when nothing supports it, which the query does
 * not currently return -- but a rail item with `reason: {friendCount: 0,
 * neighbourCount: 0}` would render as an empty explanation, and leaving the
 * field nullable is cheaper than discovering that on a screen.
 */
function toRecommendedItem(row: {
  media: Parameters<typeof toMedia>[0]
  average: string | null
  ratingCount: number
  friendCount: number
  friendNames: string[]
  neighbourCount: number
}): DiscoverItem {
  const hasReason = row.friendCount > 0 || row.neighbourCount > 0

  return {
    media: toMedia(row.media),
    averageRating: row.average === null ? null : Number(row.average),
    ratingCount: row.ratingCount,
    friends: [],
    reason: hasReason
      ? {
          friendCount: row.friendCount,
          friendNames: row.friendNames,
          neighbourCount: row.neighbourCount,
        }
      : null,
  }
}

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
