import { listService } from '@revy/core'
import { createListSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'

/** Creates a list (SPEC 15). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, createListSchema)
  const ctx = await useAuthenticatedContext(event)

  // Limited after the context is built, not before: `identify` keys on
  // `viewerId`, which only exists once the session is resolved. Keying writes
  // by user rather than IP means everyone behind one NAT does not share a
  // budget. The global middleware already caps unauthenticated floods by IP,
  // so the session lookup this costs is bounded.
  await assertRateLimit(event, RATE_LIMITS.write)
  return { list: await listService.create(ctx, input) }
})
