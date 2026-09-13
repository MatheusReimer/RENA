import { RATE_LIMITS, type RateLimitRule } from '@revy/shared/constants'
import { errors } from '@revy/shared/utils'
import type { H3Event } from 'h3'

export { RATE_LIMITS }

/**
 * Rate limiting (SPEC 39).
 *
 * A fixed-window counter in Nitro's storage layer. Fixed rather than sliding
 * because it is one read and one write per request and the failure mode is
 * understood: a caller can burst up to 2x the limit across a window boundary.
 * For "stop brute force and abuse" that is entirely adequate; a sliding window
 * costs more storage operations than the problem is worth here.
 *
 * The driver is Nitro's default in-memory store, which means limits are
 * per-instance. On a single server that is exact. On serverless it is weaker
 * than it looks -- each cold instance starts its own counters -- so a real
 * deployment should point the `ratelimit` mount at Redis or Vercel KV in
 * nuxt.config. The code below does not change; only the driver does.
 */

/**
 * The identity a limit counts against.
 *
 * Signed-in requests are keyed by user id: it is the accurate unit, and it
 * stops everyone behind one office NAT from sharing a budget. Signed-out
 * requests fall back to IP, read through Nitro so a proxy's X-Forwarded-For is
 * honoured where it is trustworthy.
 */
function identify(event: H3Event): string {
  const viewerId = event.context.viewerId as string | null | undefined
  if (viewerId) return `user:${viewerId}`

  const ip = getRequestIP(event, { xForwardedFor: true })
  return `ip:${ip ?? 'unknown'}`
}

interface WindowState {
  count: number
  /** Epoch ms when the current window ends. */
  resetAt: number
}

/**
 * Consumes one unit against a rule.
 *
 * Returns the remaining allowance rather than throwing, so callers can add
 * headers before deciding. `assertRateLimit` is the usual entry point.
 */
export async function consumeRateLimit(
  event: H3Event,
  rule: RateLimitRule,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const storage = useStorage('ratelimit')
  const key = `${rule.bucket}:${identify(event)}`
  const now = Date.now()

  let state: WindowState | null = null
  try {
    state = await storage.getItem<WindowState>(key)
  } catch (error) {
    // A broken limiter must not take the API down with it. Log and allow:
    // availability matters more than a perfectly enforced ceiling, and the
    // alternative is an outage in the storage layer becoming a total outage.
    console.error('[revy] rate limit store unavailable', error)
    return { allowed: true, remaining: rule.limit, resetAt: now }
  }

  if (!state || state.resetAt <= now) {
    state = { count: 0, resetAt: now + rule.windowSeconds * 1000 }
  }

  state.count += 1

  try {
    await storage.setItem(key, state, {
      // TTL lets the driver evict expired windows; without it an in-memory
      // store grows one entry per distinct caller, forever.
      ttl: rule.windowSeconds,
    })
  } catch (error) {
    console.error('[revy] rate limit store write failed', error)
    return { allowed: true, remaining: rule.limit, resetAt: now }
  }

  return {
    allowed: state.count <= rule.limit,
    remaining: Math.max(0, rule.limit - state.count),
    resetAt: state.resetAt,
  }
}

/**
 * Enforces a rule, throwing RATE_LIMITED when it is exceeded.
 *
 * Sets the standard rate-limit headers on every response, not just rejections,
 * so a well-behaved client can slow down before it is refused.
 */
export async function assertRateLimit(event: H3Event, rule: RateLimitRule): Promise<void> {
  const { allowed, remaining, resetAt } = await consumeRateLimit(event, rule)
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))

  setResponseHeaders(event, {
    'x-ratelimit-limit': String(rule.limit),
    'x-ratelimit-remaining': String(remaining),
    'x-ratelimit-reset': String(Math.ceil(resetAt / 1000)),
  })

  if (allowed) return

  // h3 types Retry-After as a number of seconds, not a string.
  setResponseHeader(event, 'retry-after', retryAfter)
  throw errors.rateLimited(
    `Too many requests. Try again in ${formatRetry(retryAfter)}.`,
  )
}

/** Human phrasing for the retry hint, since the message is user-facing. */
function formatRetry(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'a minute' : `${minutes} minutes`
}
