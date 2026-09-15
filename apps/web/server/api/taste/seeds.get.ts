import { tasteService } from '@revy/core'
import { seedQuerySchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../utils/handler'

/**
 * Titles to offer for rating (SPEC 21).
 *
 * Driven by the query rather than by stored taste, because the reader is still
 * mid-flow when this is called: they have chosen kinds and moods on the screen
 * in front of them and nothing has been saved yet.
 */
export default defineApiHandler(async (event) => {
  const { mediaTypes, moodKeys, limit } = readValidatedQueryOrThrow(event, seedQuerySchema)
  const ctx = await useAuthenticatedContext(event)
  return { titles: await tasteService.seeds(ctx, { mediaTypes, moodKeys, limit }) }
})
