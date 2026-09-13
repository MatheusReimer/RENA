import { listService } from '@revy/core'
import { createListSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/** Creates a list (SPEC 15). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, createListSchema)
  const ctx = await useAuthenticatedContext(event)
  return { list: await listService.create(ctx, input) }
})
