import { communityService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { z } from 'zod'
import { useAuthenticatedContext, useVerifiedContext } from '../../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../../utils/handler'

/**
 * Joins or leaves a community (SPEC 14).
 *
 * One endpoint taking the desired state rather than two verbs, so a
 * double-tapped Join button converges instead of toggling.
 *
 * Only joining needs a confirmed address. Leaving must always be possible:
 * the two directions share an endpoint, and gating the whole handler would
 * shut an unconfirmed member inside a community with no way out -- a door
 * that locks from the inside because the lock was fitted to the doorway
 * rather than to the direction of travel.
 */
export default defineApiHandler(async (event) => {
  const mediaId = uuidSchema.parse(getRouterParam(event, 'id'))
  const { joined } = await readValidatedBodyOrThrow(event, z.object({ joined: z.boolean() }))

  if (!joined) {
    const ctx = await useAuthenticatedContext(event)
    return communityService.leave(ctx, mediaId)
  }

  const ctx = await useVerifiedContext(event)
  return communityService.join(ctx, mediaId)
})
