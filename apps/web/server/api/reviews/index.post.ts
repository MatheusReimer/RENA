import { reviewService } from '@revy/core'
import { createReviewSchema } from '@revy/shared/schemas'
import { useVerifiedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'

/**
 * Writes a review (SPEC 11).
 *
 * An attached score rates the media in the same transaction, so the client
 * never has to fire two requests that could half-succeed.
 */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, createReviewSchema)
  const ctx = await useVerifiedContext(event)

  // Limited after the context is built, not before: `identify` keys on
  // `viewerId`, which only exists once the session is resolved. Keying writes
  // by user rather than IP means everyone behind one NAT does not share a
  // budget. The global middleware already caps unauthenticated floods by IP,
  // so the session lookup this costs is bounded.
  await assertRateLimit(event, RATE_LIMITS.write)
  return { review: await reviewService.create(ctx, input) }
})
