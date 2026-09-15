import { conversationService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/**
 * One conversation's header (SPEC 12).
 *
 * Separate from the messages so the thread screen can render who it is with
 * and whether the composer is open before the first page of messages lands.
 */
export default defineApiHandler(async (event) => {
  const conversationId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useAuthenticatedContext(event)
  return { conversation: await conversationService.get(ctx, conversationId) }
})
