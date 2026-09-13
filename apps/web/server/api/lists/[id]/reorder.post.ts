import { listService } from '@revy/core'
import { reorderListSchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/** Reorders a list from a full sequence of item ids (SPEC 15). */
export default defineApiHandler(async (event) => {
  const listId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, reorderListSchema)
  const ctx = await useAuthenticatedContext(event)
  await listService.reorder(ctx, listId, input)
  return { ok: true }
})
