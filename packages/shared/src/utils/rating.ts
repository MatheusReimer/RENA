import {
  RATING_MAX,
  RATING_MAX_HALF_STEPS,
  RATING_MIN,
  RATING_MIN_HALF_STEPS,
  RATING_STEP,
} from '../constants/rating'

/**
 * Ratings are a 0.5-5.0 scale (SPEC 10) but are persisted as an integer count
 * of half-steps (1-10).
 *
 * Storing 4.5 as a float invites `WHERE score = 4.5` to miss rows and makes
 * AVG() results drift; an integer column sidesteps both. These two functions
 * are the only places the two representations meet.
 */

/** 4.5 -> 9 */
export function toHalfSteps(score: number): number {
  return Math.round(score / RATING_STEP)
}

/** 9 -> 4.5 */
export function toScore(halfSteps: number): number {
  return halfSteps * RATING_STEP
}

/** True when `score` is on the scale and lands on a legal 0.5 increment. */
export function isValidScore(score: number): boolean {
  if (!Number.isFinite(score)) return false
  if (score < RATING_MIN || score > RATING_MAX) return false
  // Compare in half-steps to avoid float modulo noise (4.5 % 0.5 !== 0 in IEEE754).
  const steps = score / RATING_STEP
  return Number.isInteger(Math.round(steps * 1e6) / 1e6) && Number.isInteger(Math.round(steps))
}

/** True when a persisted half-step value is in range. */
export function isValidHalfSteps(halfSteps: number): boolean {
  return (
    Number.isInteger(halfSteps) &&
    halfSteps >= RATING_MIN_HALF_STEPS &&
    halfSteps <= RATING_MAX_HALF_STEPS
  )
}

/**
 * Snap an arbitrary number onto the nearest legal score, clamped to the scale.
 * Used by the star picker, where a drag produces continuous values.
 */
export function clampToScale(score: number): number {
  if (!Number.isFinite(score)) return RATING_MIN
  const snapped = Math.round(score / RATING_STEP) * RATING_STEP
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Number(snapped.toFixed(1))))
}

/** Renders an average as it appears in the UI: 4.6, 5.0, or an em dash. */
export function formatAverage(average: number | null): string {
  if (average === null || !Number.isFinite(average)) return '—'
  return average.toFixed(1)
}

/**
 * Splits a score into the full / half / empty star counts the star component
 * renders. Always sums to 5.
 */
export function toStarParts(score: number | null): {
  full: number
  half: number
  empty: number
} {
  if (score === null || !Number.isFinite(score)) return { full: 0, half: 0, empty: 5 }
  const clamped = Math.min(RATING_MAX, Math.max(0, score))
  const full = Math.floor(clamped)
  const half = clamped - full >= 0.5 ? 1 : 0
  return { full, half, empty: 5 - full - half }
}

/**
 * Formats a rating count the way the design does: 128K, 1.2M, 942.
 */
export function formatRatingCount(count: number): string {
  if (count < 1000) return String(count)
  if (count < 1_000_000) {
    const k = count / 1000
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, '') : Math.round(k)}K`
  }
  const m = count / 1_000_000
  return `${m < 10 ? m.toFixed(1).replace(/\.0$/, '') : Math.round(m)}M`
}
