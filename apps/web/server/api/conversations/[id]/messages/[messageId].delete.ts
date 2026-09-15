import { conversationService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../../utils/context'
import { defineApiHandler } from '../../../../utils/handler'

/**
 * Hides a message from the caller's own view (SPEC 12).
 *
 * "Delete for me". The row survives and the other participant still sees it,
 * which is why this is nested under the conversation rather than sitting at
 * `/api/messages/:id`: the authorization question is "are you in this
 * conversation", and the route should have to carry the conversation to ask it.
 */
export default defineApiHandler(async (event) => {
  const conversationId = uuidSchema.parse(getRouterParam(event, 'id'))
  const messageId = uuidSchema.parse(getRouterParam(event, 'messageId'))
  const ctx = await useAuthenticatedContext(event)

  await conversationService.hideMessage(ctx, conversationId, messageId)
  return { ok: true as const }
})
