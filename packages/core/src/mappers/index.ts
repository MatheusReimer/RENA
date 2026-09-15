import type { schema } from '@revy/db'
import type {
  CommunityReview,
  Media,
  MediaRatingSummary,
  TrendingTile,
  UserSummary,
} from '@revy/shared/types'
import { excerpt, releaseYear, toScore } from '@revy/shared/utils'

/**
 * Row -> DTO mapping, in one place.
 *
 * Every API response shape is produced here rather than inline in services, so
 * a column rename cannot leak into a client and internal columns (auth ids,
 * sync timestamps) can never be returned by accident (SPEC 39).
 */

type UserRow = typeof schema.users.$inferSelect
type MediaRow = typeof schema.media.$inferSelect
type RatingStatsRow = typeof schema.mediaRatingStats.$inferSelect

export function toUserSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    // Free: it is a column on the row every caller already selected. That is
    // the whole reason it is denormalised rather than joined.
    titleSlug: row.titleBadgeSlug,
  }
}

export function toMedia(row: MediaRow): Media {
  return {
    id: row.id,
    mediaType: row.mediaType,
    title: row.title,
    originalTitle: row.originalTitle,
    description: row.description,
    releaseDate: row.releaseDate,
    coverImageUrl: row.coverImageUrl,
    backdropImageUrl: row.backdropImageUrl,
    metadata: row.metadata ?? {},
  }
}

/**
 * Turns the denormalised aggregate row into the public summary.
 *
 * Scores are stored as half-steps, so both the average and the histogram keys
 * convert back to the 0.5-5.0 scale here -- the only place that happens for
 * aggregates.
 */
export function toRatingSummary(row: RatingStatsRow | null | undefined): MediaRatingSummary {
  if (!row || row.ratingCount === 0) {
    return { average: null, count: 0, distribution: {} }
  }

  const distribution: Record<string, number> = {}
  for (const [halfSteps, count] of Object.entries(row.distribution ?? {})) {
    const score = toScore(Number(halfSteps))
    if (Number.isFinite(score)) distribution[score.toFixed(1)] = count
  }

  return {
    average: averageScore(row.ratingSum, row.ratingCount),
    count: row.ratingCount,
    distribution,
  }
}

/**
 * A stored sum of half-steps and a count, as the 0.5-5.0 average people read.
 *
 * Null rather than 0.0 for an unrated title. Zero is a verdict -- it says the
 * community hated the thing -- and "nobody has said yet" is not a verdict at
 * all, so the two must not share a representation.
 */
export function averageScore(ratingSum: number, ratingCount: number): number | null {
  if (ratingCount <= 0) return null
  // The sum is in half-steps; /2 converts the mean back to the 0.5-5 scale.
  return Math.round((ratingSum / ratingCount / 2) * 10) / 10
}

/* ------------------------------------------------------------------ *
 * The landing screen
 * ------------------------------------------------------------------ */

type TrendingRow = Pick<
  MediaRow,
  'id' | 'mediaType' | 'title' | 'coverImageUrl' | 'releaseDate' | 'metadata'
> & {
  /** Null where a title has no stats row at all, not merely no ratings. */
  ratingCount: number | null
  ratingSum: number | null
}

export function toTrendingTile(row: TrendingRow): TrendingTile {
  const ratingCount = row.ratingCount ?? 0

  return {
    id: row.id,
    mediaType: row.mediaType,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    // Formatted here rather than in the component: the rail prints a year and
    // has no use for the rest of a date, so the rest need not cross the wire.
    releaseYear: releaseYear(row.releaseDate),
    ratingAverage: averageScore(row.ratingSum ?? 0, ratingCount),
    ratingCount,
  }
}

/**
 * How much of a review reaches a card.
 *
 * Shorter than the repository's 240-character ceiling on purpose: the query
 * decides which reviews are *eligible*, this decides what fits on a card at
 * the size it is drawn. Trimming here rather than in the component means the
 * full text never crosses the wire for a card that cannot show it.
 */
const QUOTE_LENGTH = 150

type CommunityReviewRow = {
  id: string
  content: string
  likeCount: number
  commentCount: number
  createdAt: Date
  mediaId: string
  mediaTitle: string
  mediaType: MediaRow['mediaType']
  coverImageUrl: string | null
  /** Half-steps, or null where the author wrote without scoring. */
  score: number | null
  authorId: string
  authorUsername: string
  authorDisplayName: string
  authorAvatarUrl: string | null
  authorTitleSlug: string | null
}

export function toCommunityReview(row: CommunityReviewRow): CommunityReview {
  return {
    id: row.id,
    author: {
      id: row.authorId,
      username: row.authorUsername,
      displayName: row.authorDisplayName,
      avatarUrl: row.authorAvatarUrl,
      titleSlug: row.authorTitleSlug,
    },
    mediaId: row.mediaId,
    mediaTitle: row.mediaTitle,
    mediaType: row.mediaType,
    coverImageUrl: row.coverImageUrl,
    score: row.score === null ? null : toScore(row.score),
    quote: excerpt(row.content, QUOTE_LENGTH),
    likeCount: row.likeCount,
    commentCount: row.commentCount,
    createdAt: toIsoRequired(row.createdAt),
  }
}

/** Timestamps cross the API boundary as ISO strings, never as Date objects. */
export function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** Same, for columns that are NOT NULL so the caller needs no null branch. */
export function toIsoRequired(value: Date): string {
  return value.toISOString()
}
