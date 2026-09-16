import { reviewService } from '@revy/core'
import { updateReviewSchema, uuidSchema } from '@revy/shared/schemas'
import { useVerifiedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/** Edits a review. Ownership is enforced in the service (SPEC 27). */
export default defineApiHandler(async (event) => {
  const reviewId = uuidSchema.parse(getRouterParam(event, 'id'))
  const input = await readValidatedBodyOrThrow(event, updateReviewSchema)
  const ctx = await useVerifiedContext(event)
  return { review: await reviewService.update(ctx, reviewId, input) }
})
