import { tasteService } from '@revy/core'
import { tasteSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/**
 * Records what the reader picked (SPEC 21).
 *
 * Also the endpoint a skip posts to, with `skipped: true` and empty lists --
 * so "asked and declined" is a stored fact rather than the absence of one, and
 * the screen knows not to ambush them again on their next visit.
 */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, tasteSchema)
  const ctx = await useAuthenticatedContext(event)
  return { taste: await tasteService.save(ctx, input) }
})
