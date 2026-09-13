import { RATE_LIMITS, assertRateLimit } from '../utils/rate-limit'
import { sendDomainError } from '../utils/handler'

/**
 * Global rate-limit backstop for the API (SPEC 39).
 *
 * Numbered `01.` so it runs before anything else: Nitro orders middleware
 * alphabetically, and a limiter that runs after the work it is meant to
 * prevent is decoration.
 *
 * This is the catch-all. Endpoints needing a tighter rule apply their own on
 * top, in a separate bucket, so the two counters never interfere.
 */
export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return

  try {
    await assertRateLimit(event, RATE_LIMITS.global)
  } catch (error) {
    // Middleware sits outside defineApiHandler, so the envelope is applied
    // here rather than inherited (SPEC 35).
    return sendDomainError(event, error)
  }
})
