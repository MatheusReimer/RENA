import { listService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/** Deletes a list and its items. Owner only (SPEC 27). */
export default defineApiHandler(async (event) => {
  const listId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useAuthenticatedContext(event)
  await listService.remove(ctx, listId)
  return { ok: true }
})
