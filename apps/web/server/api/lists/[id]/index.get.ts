import { listService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/**
 * A list with its items (SPEC 15).
 *
 * Open to signed-out callers: a public list is public. Visibility is enforced
 * in the service, which reports anything the viewer may not see as not-found.
 */
export default defineApiHandler(async (event) => {
  const listId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useServiceContext(event)
  return { list: await listService.get(ctx, listId) }
})
