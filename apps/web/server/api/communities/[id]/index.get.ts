import { communityService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/** One community with its member list (SPEC 14). */
export default defineApiHandler(async (event) => {
  const mediaId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useServiceContext(event)
  return { community: await communityService.get(ctx, mediaId) }
})
