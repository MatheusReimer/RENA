import { ratingService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { z } from 'zod'
import { useAuthenticatedContext } from '../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../utils/handler'

/** Removes the viewer's rating for a media item (SPEC 10). */
export default defineApiHandler(async (event) => {
  const { mediaId } = readValidatedQueryOrThrow(event, z.object({ mediaId: uuidSchema }))
  const ctx = await useAuthenticatedContext(event)
  await ratingService.remove(ctx, mediaId)
  return { ok: true }
})
