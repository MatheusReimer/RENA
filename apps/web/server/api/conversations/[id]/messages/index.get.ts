import { conversationService } from '@revy/core'
import { messageQuerySchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../../../utils/handler'

/**
 * A page of a thread (SPEC 12).
 *
 * Serves both readers: `before` pages backwards through history as the reader
 * scrolls up, and `after` is what the open thread polls every few seconds.
 * One endpoint rather than two, because they differ only in which side of a
 * cursor they read and a second route would duplicate the authorization.
 *
 * Not rate limited beyond the global backstop: this is a read, it is polled by
 * design, and a per-route limit here would throttle the feature working
 * normally rather than anything abusive.
 */
export default defineApiHandler(async (event) => {
  const conversationId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = readValidatedQueryOrThrow(event, messageQuerySchema)
  const ctx = await useAuthenticatedContext(event)

  return conversationService.listMessages(ctx, conversationId, input)
})
