import { feedService } from '@revy/core'
import { feedQuerySchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../utils/handler'

/** The home activity feed (SPEC 13, 18). */
export default defineApiHandler(async (event) => {
  const input = readValidatedQueryOrThrow(event, feedQuerySchema)
  const ctx = await useAuthenticatedContext(event)
  return feedService.getFeed(ctx, input)
})
