import { reviewService } from '@revy/core'
import { createReviewSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/**
 * Writes a review (SPEC 11).
 *
 * An attached score rates the media in the same transaction, so the client
 * never has to fire two requests that could half-succeed.
 */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, createReviewSchema)
  const ctx = await useAuthenticatedContext(event)
  return { review: await reviewService.create(ctx, input) }
})
