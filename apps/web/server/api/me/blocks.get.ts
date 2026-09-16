import { moderationService } from '@revy/core'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * Who the viewer has blocked.
 *
 * The list has to exist somewhere they can reach without going to the profile
 * they hid -- which, being hidden, they cannot open. Settings is that place.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)
  return { users: await moderationService.listBlocked(ctx) }
})
