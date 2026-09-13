import { listService } from '@revy/core'
import { updateListSchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/** Renames a list or changes its visibility. Owner only (SPEC 27). */
export default defineApiHandler(async (event) => {
  const listId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, updateListSchema)
  const ctx = await useAuthenticatedContext(event)
  return { list: await listService.update(ctx, listId, input) }
})
