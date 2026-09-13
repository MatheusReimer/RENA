import { userService } from '@revy/core'
import { updateProfileSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/** Edits the viewer's own profile (SPEC 27). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, updateProfileSchema)
  const ctx = await useAuthenticatedContext(event)
  return { user: await userService.updateProfile(ctx, input) }
})
