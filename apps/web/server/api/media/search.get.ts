import { mediaService, userService } from '@revy/core'
import { mediaSearchSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../utils/context'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../utils/handler'

/**
 * Global search (SPEC 20).
 *
 * Returns media grouped by type plus matching people, so the search screen's
 * All / Movies / Series / Books / People tabs are one request rather than five.
 */
export default defineApiHandler(async (event) => {
  // Search reaches external catalogues, so this protects our provider quota
  // as much as our own server.
  await assertRateLimit(event, RATE_LIMITS.search)

  const input = readValidatedQueryOrThrow(event, mediaSearchSchema)
  const ctx = await useServiceContext(event)

  const [media, people] = await Promise.all([
    mediaService.search(ctx, input),
    // People are only searched on the All and People tabs; a type filter means
    // the caller is looking at media.
    input.type ? Promise.resolve([]) : userService.search(ctx, input.q, 10),
  ])

  return { media, people }
})
