import { communityService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { z } from 'zod'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/**
 * Joins or leaves a community (SPEC 14).
 *
 * One endpoint taking the desired state rather than two verbs, so a
 * double-tapped Join button converges instead of toggling.
 */
export default defineApiHandler(async (event) => {
  const mediaId = uuidSchema.parse(getRouterParam(event, 'id'))
  const { joined } = await readValidatedBodyOrThrow(event, z.object({ joined: z.boolean() }))
  const ctx = await useAuthenticatedContext(event)

  return joined
    ? communityService.join(ctx, mediaId)
    : communityService.leave(ctx, mediaId)
})
