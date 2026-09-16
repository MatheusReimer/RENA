import { conversationService } from '@revy/core'
import { sendMessageSchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../../../utils/rate-limit'

/**
 * Sends a message (SPEC 12).
 *
 * The body is encrypted inside the service before it reaches the database, so
 * the plaintext exists in this process and nowhere that persists. Nothing
 * about that is visible here, deliberately: a route that had to remember to
 * encrypt is a route that will eventually forget.
 *
 * Limited after the context is built, so the counter keys on the user rather
 * than on whatever NAT they share.
 */
export default defineApiHandler(async (event) => {
  const conversationId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, sendMessageSchema)
  const ctx = await useAuthenticatedContext(event)

  await assertRateLimit(event, RATE_LIMITS.message)
  return { message: await conversationService.send(ctx, conversationId, input) }
})
