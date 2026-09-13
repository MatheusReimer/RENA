import { friendshipService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/** Cancels a pending request or removes an existing friend (SPEC 12). */
export default defineApiHandler(async (event) => {
  const targetUserId = uuidSchema.parse(getRouterParam(event, 'userId'))
  const ctx = await useAuthenticatedContext(event)
  await friendshipService.remove(ctx, targetUserId)
  return { ok: true }
})
