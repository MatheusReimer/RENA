import { RATE_LIMITS } from '@revy/shared/constants'
import { describe, expect, it } from 'vitest'

/**
 * Rate limit configuration (SPEC 39, 43).
 *
 * Asserts the shape and relative severity of the real rules, not the
 * enforcement -- which needs an H3 event and belongs in integration tests.
 * What this catches is a rule edited into something nonsensical: a limit of
 * zero, a window of zero, or auth quietly loosened to match ordinary browsing.
 *
 * The assertions encode intent rather than restating the numbers, so tuning a
 * limit does not mechanically break them but gutting one does.
 */

const rules = Object.entries(RATE_LIMITS)

describe('rate limit rules', () => {
  it.each(rules)('%s allows at least one request per window', (_name, rule) => {
    expect(rule.limit).toBeGreaterThan(0)
    expect(rule.windowSeconds).toBeGreaterThan(0)
  })

  it('uses a distinct bucket per rule', () => {
    const buckets = rules.map(([, rule]) => rule.bucket)
    // Two rules sharing a bucket would silently share a counter, making the
    // stricter one leak allowance to the looser one.
    expect(new Set(buckets).size).toBe(buckets.length)
  })

  it('is strictest on the credential endpoints', () => {
    // Brute force is the threat these exist for; if auth is ever as permissive
    // as ordinary reads, the control has been neutralised.
    const perSecond = (r: { limit: number; windowSeconds: number }) => r.limit / r.windowSeconds
    expect(perSecond(RATE_LIMITS.auth)).toBeLessThan(perSecond(RATE_LIMITS.global))
    expect(perSecond(RATE_LIMITS.auth)).toBeLessThan(perSecond(RATE_LIMITS.write))
    expect(perSecond(RATE_LIMITS.register)).toBeLessThan(perSecond(RATE_LIMITS.auth))
  })

  it('keeps sign-in attempts well below an online guessing budget', () => {
    // 10 attempts per 15 minutes is ~960/day against one account. A password
    // policy of 8+ characters makes that hopeless, which is the point.
    const perDay = (RATE_LIMITS.auth.limit / RATE_LIMITS.auth.windowSeconds) * 86_400
    expect(perDay).toBeLessThan(2000)
  })

  it('leaves the global backstop above real browsing volume', () => {
    // A page load fans out to a handful of API calls; the backstop must not
    // catch someone simply using the app.
    expect(RATE_LIMITS.global.limit).toBeGreaterThanOrEqual(120)
  })
})
