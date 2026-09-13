import { reviewService } from '@revy/core'
import { cursorPageSchema, uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../../utils/handler'

/** Reviews for a media item, cursor-paginated (SPEC 19, 38). */
export default defineApiHandler(async (event) => {
  const mediaId = uuidSchema.parse(getRouterParam(event, 'id'))
  const page = readValidatedQueryOrThrow(event, cursorPageSchema)
  const ctx = await useServiceContext(event)

  return reviewService.listForMedia(ctx, mediaId, page.limit, page.cursor ?? null)
})
