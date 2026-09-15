import { isReleased } from '@revy/shared/utils'
import { describe, expect, it } from 'vitest'

/**
 * The unreleased-title rule.
 *
 * Avengers: Doomsday was in the catalogue with a 2026 date and collecting
 * ratings, which makes every aggregate on the site a little less true. The
 * predicate is tiny; what is worth pinning down is which way it fails, because
 * the two failure directions are not equally bad:
 *
 *  - Wrongly "released" lets somebody rate a film that is not out. Annoying.
 *  - Wrongly "unreleased" takes the rating control away from a title that has
 *    been out for forty years. That is the one that makes the product look
 *    broken, and most of the catalogue has imperfect dates.
 *
 * So the rule is "we know it is in the future", not "we cannot prove it is in
 * the past", and these lock that in.
 */

const NOW = new Date('2026-09-14T12:00:00.000Z')

describe('isReleased', () => {
  it('allows a title released in the past', () => {
    expect(isReleased('2008-07-18', NOW)).toBe(true)
  })

  it('blocks a title dated in the future', () => {
    expect(isReleased('2026-12-18', NOW)).toBe(false)
  })

  it('allows a title released today', () => {
    expect(isReleased('2026-09-14', NOW)).toBe(true)
  })

  it('blocks tomorrow', () => {
    expect(isReleased('2026-09-15', NOW)).toBe(false)
  })

  /*
   * The catalogue is full of these. Most books have no date, and so do plenty
   * of older films -- refusing to let anyone rate them would break far more
   * than the rule fixes.
   */
  it('allows a title with no date at all', () => {
    expect(isReleased(null, NOW)).toBe(true)
    expect(isReleased(undefined, NOW)).toBe(true)
    expect(isReleased('', NOW)).toBe(true)
  })

  it('allows a bare year once that year has started', () => {
    expect(isReleased('2026', NOW)).toBe(true)
    expect(isReleased('1994', NOW)).toBe(true)
  })

  it('blocks a bare year still to come', () => {
    expect(isReleased('2027', NOW)).toBe(false)
  })

  it('allows a date it cannot parse rather than locking the title', () => {
    expect(isReleased('coming soon', NOW)).toBe(true)
    expect(isReleased('TBA', NOW)).toBe(true)
  })

  /*
   * Why this compares strings and not Dates.
   *
   * A release date is a calendar day, not an instant. `new Date('2026-09-14')`
   * is UTC midnight, which is still tomorrow in Auckland and already yesterday
   * in Los Angeles -- so a Date comparison makes the answer depend on where
   * the reader is sitting, and the same title is rateable for some people and
   * not others. Comparing ISO day strings is the one thing every timezone
   * agrees on.
   */
  it('gives the same answer either side of the date line', () => {
    const justAfterUtcMidnight = new Date('2026-09-14T00:30:00.000Z')
    const justBeforeUtcMidnight = new Date('2026-09-14T23:30:00.000Z')

    expect(isReleased('2026-09-14', justAfterUtcMidnight)).toBe(true)
    expect(isReleased('2026-09-14', justBeforeUtcMidnight)).toBe(true)
    expect(isReleased('2026-09-15', justBeforeUtcMidnight)).toBe(false)
  })

  it('ignores a time component on the release date', () => {
    expect(isReleased('2026-09-14T23:00:00Z', NOW)).toBe(true)
    expect(isReleased('2026-09-15T00:00:00Z', NOW)).toBe(false)
  })
})
