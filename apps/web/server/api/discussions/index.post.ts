import { discussionService } from '@revy/core'
import { createThreadSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'

/** Opens a discussion thread, optionally with its first comment (SPEC 14). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, createThreadSchema)
  const ctx = await useAuthenticatedContext(event)

  // Limited after the context is built, not before: `identify` keys on
  // `viewerId`, which only exists once the session is resolved. Keying writes
  // by user rather than IP means everyone behind one NAT does not share a
  // budget. The global middleware already caps unauthenticated floods by IP,
  // so the session lookup this costs is bounded.
  await assertRateLimit(event, RATE_LIMITS.write)
  return { thread: await discussionService.createThread(ctx, input) }
})
