import { listService } from '@revy/core'
import { addListItemSchema, uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../../utils/handler'

/**
 * Adds media to a list (SPEC 15).
 *
 * Adding something already present returns `added: false` rather than an
 * error: the list ends up in the state the caller asked for either way.
 */
export default defineApiHandler(async (event) => {
  const listId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, addListItemSchema)
  const ctx = await useAuthenticatedContext(event)
  return listService.addItem(ctx, listId, input)
})
