import { userService } from '@revy/core'
import { usernameSchema } from '@revy/shared/schemas'
import { z } from 'zod'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../utils/handler'

/**
 * Live username availability for the signup form.
 *
 * Purely a UX affordance -- registration re-checks and the unique index is the
 * real guarantee (SPEC 25: client validation is for UX, server for correctness).
 */
export default defineApiHandler(async (event) => {
  const { username } = readValidatedQueryOrThrow(event, z.object({ username: usernameSchema }))
  const ctx = await useServiceContext(event)
  return { available: await userService.isUsernameAvailable(ctx, username) }
})
