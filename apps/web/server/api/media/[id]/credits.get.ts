import { personService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/**
 * A title's cast and crew.
 *
 * Its own request rather than part of the media payload: it is a strip below
 * the fold, it is twenty rows with a join, and the page is already several
 * queries deep before it paints anything.
 */
export default defineApiHandler(async (event) => {
  const mediaId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useServiceContext(event)
  return { credits: await personService.creditsForMedia(ctx, mediaId) }
})
