import { moderationService, userRepository } from '@revy/core'
import { usernameSchema } from '@revy/shared/schemas'
import { errors } from '@revy/shared/utils'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/**
 * Unblocks somebody.
 *
 * Resolved through the repository rather than `userService.getProfileByUsername`,
 * which is the one place that would be wrong: a blocked profile reports itself
 * as missing, so asking it for the id of the person you are trying to unblock
 * would always fail.
 */
export default defineApiHandler(async (event) => {
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const ctx = await useAuthenticatedContext(event)

  const target = await userRepository.findByUsername(ctx.db, username)
  if (!target) throw errors.userNotFound()

  await moderationService.unblock(ctx, target.id)

  return { blocked: false }
})
