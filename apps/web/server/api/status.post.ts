import { ratingService } from '@revy/core'
import { setMediaStatusSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../utils/handler'

/** Sets consumption status: want to watch / watching / watched (SPEC 9). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, setMediaStatusSchema)
  const ctx = await useAuthenticatedContext(event)
  await ratingService.setStatus(ctx, input)
  return { ok: true }
})
