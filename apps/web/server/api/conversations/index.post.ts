import { conversationService } from '@revy/core'
import { startConversationSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'

/**
 * Opens a conversation with someone, or returns the existing one (SPEC 12).
 *
 * Idempotent, so this is a POST that is safe to repeat -- pressing "Message"
 * twice gives the same conversation rather than two.
 *
 * Rate limited on the write bucket rather than the message bucket: the cost
 * being bounded here is row creation, and sending is limited separately.
 */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, startConversationSchema)
  const ctx = await useAuthenticatedContext(event)

  await assertRateLimit(event, RATE_LIMITS.write)
  return { conversation: await conversationService.start(ctx, input.userId) }
})
