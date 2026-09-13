import { listService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../../utils/context'
import { defineApiHandler } from '../../../../utils/handler'

/** Removes media from a list. Owner only (SPEC 27). */
export default defineApiHandler(async (event) => {
  const listId = uuidSchema.parse(getRouterParam(event, 'id'))
  const mediaId = uuidSchema.parse(getRouterParam(event, 'mediaId'))
  const ctx = await useAuthenticatedContext(event)
  return listService.removeItem(ctx, listId, mediaId)
})
