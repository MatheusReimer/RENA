import { entryService } from '@revy/core'
import { usernameSchema, uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../../utils/context'
import { defineApiHandler } from '../../../../utils/handler'

/**
 * One person's entry on one title (SPEC 10, 27).
 *
 * Public, like everything it shows: the score is already on their profile and
 * the review is already on the media page. This is the same facts at their own
 * address, which is what makes them linkable.
 */
export default defineApiHandler(async (event) => {
  const username = usernameSchema.parse(getRouterParam(event, 'username'))
  const mediaId = uuidSchema.parse(getRouterParam(event, 'mediaId'))
  const ctx = await useServiceContext(event)

  return { entry: await entryService.get(ctx, username, mediaId) }
})
