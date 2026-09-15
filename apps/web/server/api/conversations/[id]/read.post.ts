import { conversationService } from '@revy/core'
import { markConversationReadSchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/**
 * Marks a conversation read up to a message (SPEC 12).
 *
 * Takes the id of the newest message the client has actually rendered rather
 * than "now", so anything that arrives between the render and this request
 * stays unread -- which is the honest answer, and the one that keeps the badge
 * from clearing messages the reader never saw.
 *
 * The service only ever moves the position forward, so two devices reading the
 * same thread cannot flip the badge back and forth.
 */
export default defineApiHandler(async (event) => {
  const conversationId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, markConversationReadSchema)
  const ctx = await useAuthenticatedContext(event)

  const { unreadMessages } = await conversationService.markRead(ctx, conversationId, input)
  // The new total rides back so the shell's badge can be corrected without a
  // second request for a number this call just changed.
  return { ok: true as const, unreadMessages }
})
