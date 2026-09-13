import { XP_LEVEL_COUNT, XP_REWARDS, xpRequiredForLevel } from '@revy/shared/constants'
import { computeXp, xpProgressRatio } from '@revy/shared/utils'
import { describe, expect, it } from 'vitest'

/** XP and level calculation (SPEC 16, 43). */

describe('computeXp', () => {
  it('starts a new user at level 1 with no progress', () => {
    const xp = computeXp(0)
    expect(xp.level).toBe(1)
    expect(xp.currentLevelXp).toBe(0)
    expect(xp.totalXp).toBe(0)
  })

  it('levels up exactly at the threshold, not before', () => {
    const threshold = xpRequiredForLevel(2)
    expect(computeXp(threshold - 1).level).toBe(1)
    expect(computeXp(threshold).level).toBe(2)
  })

  it('reports progress within the current level', () => {
    const floor = xpRequiredForLevel(3)
    const xp = computeXp(floor + 10)
    expect(xp.level).toBe(3)
    expect(xp.currentLevelXp).toBe(10)
    expect(xp.nextLevelXp).toBe(xpRequiredForLevel(4) - floor)
  })

  it('never exceeds the maximum level', () => {
    const xp = computeXp(xpRequiredForLevel(XP_LEVEL_COUNT) * 10)
    expect(xp.level).toBe(XP_LEVEL_COUNT)
  })

  it('treats negative or fractional totals as a floor of zero', () => {
    // Defensive: a revoked action could in principle drive a total negative.
    expect(computeXp(-50).level).toBe(1)
    expect(computeXp(-50).totalXp).toBe(0)
  })
})

describe('xpProgressRatio', () => {
  it('stays within 0..1 across the curve', () => {
    for (let level = 1; level <= 10; level++) {
      const floor = xpRequiredForLevel(level)
      const ratio = xpProgressRatio(computeXp(floor + 1))
      expect(ratio).toBeGreaterThanOrEqual(0)
      expect(ratio).toBeLessThanOrEqual(1)
    }
  })
})

describe('XP reward table', () => {
  it('awards more for a review than a bare rating', () => {
    // SPEC 16's intent: effortful contributions are worth more.
    expect(XP_REWARDS.write_review).toBeGreaterThan(XP_REWARDS.rate_media)
  })

  it('has no zero or negative rewards', () => {
    for (const [action, value] of Object.entries(XP_REWARDS)) {
      expect(value, `${action} should award positive XP`).toBeGreaterThan(0)
    }
  })
})
