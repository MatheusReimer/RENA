import { conversationService } from '@revy/core'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * The viewer's conversations, most recently active first (SPEC 12).
 *
 * Polled by the messages screen for unread counts, so it is deliberately one
 * response rather than a list plus a per-conversation count endpoint.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)
  return { conversations: await conversationService.list(ctx) }
})
