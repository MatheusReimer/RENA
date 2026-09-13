import { reviewService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/** Deletes a review. Ownership is enforced in the service (SPEC 27). */
export default defineApiHandler(async (event) => {
  const reviewId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useAuthenticatedContext(event)
  await reviewService.remove(ctx, reviewId)
  return { ok: true }
})
