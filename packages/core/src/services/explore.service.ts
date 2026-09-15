import { findMood } from '@revy/shared/constants'
import type { ExploreCard, ExploreSummary, MediaType, MoodRow } from '@revy/shared/types'
import { releaseYear } from '@revy/shared/utils'
import type { ServiceContext } from '../context'
import { averageScore, toCommunityReview } from '../mappers'
import { byGenres, communityReviews, hiddenGems, mostDiscussed } from '../repositories'

/**
 * The Explore screen (SPEC 21).
 *
 * Public: nothing here is about the viewer, which is what lets a signed-out
 * visitor browse before committing to anything -- and what would let this be
 * cached at the edge later without touching any of it.
 */

/** Cards in the "everyone's talking about" row. */
const DISCUSSED_COUNT = 8

/** Cards in the hidden gems row. One is featured; the rest are the tail. */
const GEM_COUNT = 6

/** Reviews in the community band. */
const REVIEW_COUNT = 3

/** Titles behind a single mood. */
const MOOD_COUNT = 12

/**
 * A row as it comes out of the database, as the card the screen draws.
 *
 * The two scores are assembled here and nowhere else: `ratingAverage` is
 * RENA's, converted out of the half-step storage, and `externalRating` is the
 * provider's, which the provider layer already normalised to 0-10 and
 * attributed. Neither is ever silently substituted for the other.
 */
function toExploreCard(row: {
  id: string
  mediaType: MediaType
  title: string
  coverImageUrl: string | null
  releaseDate: string | null
  metadata: { externalRating?: { source: string; score: number; votes: number } } | null
  ratingCount: number | null
  ratingSum: number | null
  reviewCount: number
}): ExploreCard {
  const ratingCount = row.ratingCount ?? 0

  return {
    id: row.id,
    mediaType: row.mediaType,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    releaseYear: releaseYear(row.releaseDate),
    ratingAverage: averageScore(row.ratingSum ?? 0, ratingCount),
    ratingCount,
    reviewCount: row.reviewCount,
    externalRating: row.metadata?.externalRating ?? null,
  }
}

export const exploreService = {
  /**
   * The screen's standing rows.
   *
   * `mediaType` narrows both rows at once, which is what the type chips at the
   * top of the screen do -- they filter the page, not one row of it.
   */
  async summary(ctx: ServiceContext, mediaType: MediaType | null): Promise<ExploreSummary> {
    const [discussed, gems, reviews] = await Promise.all([
      mostDiscussed(ctx.db, mediaType, DISCUSSED_COUNT),
      hiddenGems(ctx.db, mediaType, GEM_COUNT),
      communityReviews(ctx.db, REVIEW_COUNT * 4),
    ])

    return {
      discussed: discussed.map(toExploreCard),
      gems: gems.map(toExploreCard),
      reviews: distinctByQuote(reviews.map(toCommunityReview), REVIEW_COUNT),
    }
  },

  /**
   * The titles behind one mood.
   *
   * Fetched on demand rather than with the summary: six moods at a dozen
   * titles each is seventy-two rows nobody has asked for, on a screen whose
   * first impression is six photographs.
   */
  async mood(ctx: ServiceContext, key: string): Promise<MoodRow | null> {
    const mood = findMood(key)
    if (!mood) return null

    const rows = await byGenres(ctx.db, mood.genres, mood.mediaTypes, MOOD_COUNT)

    return {
      key: mood.key,
      title: mood.title,
      tags: mood.tags,
      items: rows.map(toExploreCard),
    }
  },
}

/**
 * The same opinion twice is worse than one opinion.
 *
 * Duplicated from the landing screen's service on purpose rather than shared:
 * they are two independent editorial decisions about two different rows, and
 * the day one of them wants to keep duplicates the shared helper becomes a
 * flag, then two flags.
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
