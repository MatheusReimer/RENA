import { userService } from '@revy/core'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * What the viewer is part-way through (SPEC 22).
 *
 * Its own endpoint rather than part of /api/me: the session payload is
 * requested on every page load, and this is only needed by Home.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)
  return { currently: await userService.getCurrentlyConsuming(ctx, ctx.viewerId!, 6) }
})
