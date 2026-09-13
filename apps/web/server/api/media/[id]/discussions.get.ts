import { discussionService } from '@revy/core'
import { cursorPageSchema, uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../../utils/handler'

/** Discussion threads for a media item, most recently active first (SPEC 14). */
export default defineApiHandler(async (event) => {
  const mediaId = uuidSchema.parse(getRouterParam(event, 'id'))
  const page = readValidatedQueryOrThrow(event, cursorPageSchema)
  const ctx = await useServiceContext(event)

  return discussionService.listForMedia(ctx, mediaId, page.limit, page.cursor ?? null)
})
