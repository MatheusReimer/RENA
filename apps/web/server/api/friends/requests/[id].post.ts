import { friendshipService } from '@revy/core'
import { respondToFriendRequestSchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/** Accepts or rejects an incoming friend request (SPEC 12). */
export default defineApiHandler(async (event) => {
  const friendshipId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, respondToFriendRequestSchema)
  const ctx = await useAuthenticatedContext(event)
  return { friendship: await friendshipService.respond(ctx, friendshipId, input) }
})
