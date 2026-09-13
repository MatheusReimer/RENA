import type { schema } from '@revy/db'
import type {
  Media,
  MediaRatingSummary,
  UserSummary,
} from '@revy/shared/types'
import { toScore } from '@revy/shared/utils'

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
    // ratingSum is in half-steps; /2 converts the mean back to the 0.5-5 scale.
    average: Math.round((row.ratingSum / row.ratingCount / 2) * 10) / 10,
    count: row.ratingCount,
    distribution,
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
