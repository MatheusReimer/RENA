import { discussionService } from '@revy/core'
import { createCommentSchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/**
 * Posts a comment or nested reply (SPEC 14).
 *
 * Depth is derived from the parent server-side and capped, so the client never
 * gets to claim a nesting level (SPEC 25).
 */
export default defineApiHandler(async (event) => {
  const threadId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, createCommentSchema)
  const ctx = await useAuthenticatedContext(event)
  return { comment: await discussionService.createComment(ctx, threadId, input) }
})
