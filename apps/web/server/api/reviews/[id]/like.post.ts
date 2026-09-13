import { reviewService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { z } from 'zod'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/** Likes or unlikes a review. */
export default defineApiHandler(async (event) => {
  const reviewId = uuidSchema.parse(getRouterParam(event, 'id'))
  const { liked } = await readValidatedBodyOrThrow(event, z.object({ liked: z.boolean() }))
  const ctx = await useAuthenticatedContext(event)

  if (liked) await reviewService.like(ctx, reviewId)
  else await reviewService.unlike(ctx, reviewId)

  return { ok: true }
})
