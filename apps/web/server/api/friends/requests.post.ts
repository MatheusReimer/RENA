import { friendshipService } from '@revy/core'
import { sendFriendRequestSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/** Sends a friend request (SPEC 12). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, sendFriendRequestSchema)
  const ctx = await useAuthenticatedContext(event)
  return { friendship: await friendshipService.sendRequest(ctx, input.userId) }
})
