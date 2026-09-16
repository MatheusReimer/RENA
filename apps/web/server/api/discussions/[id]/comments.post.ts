import { discussionService } from '@revy/core'
import { createCommentSchema, uuidSchema } from '@revy/shared/schemas'
import { useVerifiedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../../utils/rate-limit'

/**
 * Posts a comment or nested reply (SPEC 14).
 *
 * Depth is derived from the parent server-side and capped, so the client never
 * gets to claim a nesting level (SPEC 25).
 */
export default defineApiHandler(async (event) => {
  const threadId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, createCommentSchema)
  const ctx = await useVerifiedContext(event)

  // Limited after the context is built, not before: `identify` keys on
  // `viewerId`, which only exists once the session is resolved. Keying writes
  // by user rather than IP means everyone behind one NAT does not share a
  // budget. The global middleware already caps unauthenticated floods by IP,
  // so the session lookup this costs is bounded.
  await assertRateLimit(event, RATE_LIMITS.write)
  return { comment: await discussionService.createComment(ctx, threadId, input) }
})
