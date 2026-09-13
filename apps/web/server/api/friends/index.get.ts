import { friendshipService } from '@revy/core'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/** The viewer's friends and pending requests (SPEC 12). */
export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)

  const [friends, incoming, outgoing] = await Promise.all([
    friendshipService.listFriends(ctx, ctx.viewerId!),
    friendshipService.listIncomingRequests(ctx),
    friendshipService.listOutgoingRequests(ctx),
  ])

  return { friends, incoming, outgoing }
})
