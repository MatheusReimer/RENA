import { moderationService, userService } from '@revy/core'
import { usernameSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/**
 * Blocks somebody.
 *
 * By username rather than id, because the only place this is reached from is a
 * profile, and the profile is addressed by username everywhere else.
 *
 * Nothing is sent to the blocked person, and the response says nothing about
 * them either -- see `moderationService.block`.
 */
export default defineApiHandler(async (event) => {
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const ctx = await useAuthenticatedContext(event)

  const target = await userService.getProfileByUsername(ctx, username)
  await moderationService.block(ctx, target.id)

  return { blocked: true }
})
