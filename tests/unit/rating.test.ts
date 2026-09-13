import { RATING_VALUES } from '@revy/shared/constants'
import {
  clampToScale,
  formatAverage,
  formatRatingCount,
  isValidHalfSteps,
  isValidScore,
  toHalfSteps,
  toScore,
  toStarParts,
} from '@revy/shared/utils'
import { describe, expect, it } from 'vitest'

/** Rating validation and the half-step storage conversion (SPEC 10, 43). */

describe('score <-> half-step conversion', () => {
  it('round-trips every legal score', () => {
    for (const score of RATING_VALUES) {
      expect(toScore(toHalfSteps(score))).toBe(score)
    }
  })

  it('maps the scale to integers 1..10', () => {
    expect(toHalfSteps(0.5)).toBe(1)
    expect(toHalfSteps(2.5)).toBe(5)
    expect(toHalfSteps(5.0)).toBe(10)
  })

  it('accepts only integer half-steps in range', () => {
    expect(isValidHalfSteps(1)).toBe(true)
    expect(isValidHalfSteps(10)).toBe(true)
    expect(isValidHalfSteps(0)).toBe(false)
    expect(isValidHalfSteps(11)).toBe(false)
    expect(isValidHalfSteps(4.5)).toBe(false)
  })
})

describe('isValidScore', () => {
  it('accepts every value on the scale', () => {
    for (const score of RATING_VALUES) {
      expect(isValidScore(score)).toBe(true)
    }
  })

  it('rejects scores off the 0.5 increment', () => {
    // The case that motivates storing half-steps: 3.7 is plausible-looking
    // input that must never reach the database.
    expect(isValidScore(3.7)).toBe(false)
    expect(isValidScore(1.25)).toBe(false)
  })

  it('rejects out-of-range values including zero', () => {
    expect(isValidScore(0)).toBe(false)
    expect(isValidScore(-1)).toBe(false)
    expect(isValidScore(5.5)).toBe(false)
  })

  it('rejects non-finite values', () => {
    expect(isValidScore(Number.NaN)).toBe(false)
    expect(isValidScore(Number.POSITIVE_INFINITY)).toBe(false)
  })
})

describe('clampToScale', () => {
  it('snaps continuous drag values onto the scale', () => {
    expect(clampToScale(3.7)).toBe(3.5)
    expect(clampToScale(3.8)).toBe(4.0)
  })

  it('clamps beyond the ends of the scale', () => {
    expect(clampToScale(0)).toBe(0.5)
    expect(clampToScale(-2)).toBe(0.5)
    expect(clampToScale(7)).toBe(5.0)
  })
})

describe('toStarParts', () => {
  it('always accounts for exactly five stars', () => {
    for (const score of RATING_VALUES) {
      const { full, half, empty } = toStarParts(score)
      expect(full + half + empty).toBe(5)
    }
  })

  it('renders a half star only on the .5 values', () => {
    expect(toStarParts(4.5)).toEqual({ full: 4, half: 1, empty: 0 })
    expect(toStarParts(4.0)).toEqual({ full: 4, half: 0, empty: 1 })
  })

  it('renders an unrated item as five empty stars', () => {
    expect(toStarParts(null)).toEqual({ full: 0, half: 0, empty: 5 })
  })
})

describe('display formatting', () => {
  it('formats averages to one decimal', () => {
    expect(formatAverage(4.6)).toBe('4.6')
    expect(formatAverage(5)).toBe('5.0')
    expect(formatAverage(null)).toBe('—')
  })

  it('abbreviates rating counts the way the design does', () => {
    expect(formatRatingCount(942)).toBe('942')
    expect(formatRatingCount(1200)).toBe('1.2K')
    expect(formatRatingCount(128_000)).toBe('128K')
    expect(formatRatingCount(1_500_000)).toBe('1.5M')
  })
})
