import { ratingService } from '@revy/core'
import { upsertRatingSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../utils/handler'

/**
 * Creates or updates the viewer's rating (SPEC 10).
 *
 * POST rather than PUT because the client never knows the rating's id -- the
 * unique (user, media) pair is the identity, and the service upserts on it.
 */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, upsertRatingSchema)
  const ctx = await useAuthenticatedContext(event)
  return { rating: await ratingService.upsert(ctx, input) }
})
