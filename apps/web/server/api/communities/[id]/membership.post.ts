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
 *
 * Both directions need a confirmed address now, where once only joining did.
 *
 * The old split existed so an unconfirmed member could still leave a community
 * -- a door that locks from the inside. That door no longer opens either way:
 * an unconfirmed session cannot reach the community screen to press the button
 * at all, so the two directions have nothing left to disagree about.
 */
export default defineApiHandler(async (event) => {
  const mediaId = uuidSchema.parse(getRouterParam(event, 'id'))
  const { joined } = await readValidatedBodyOrThrow(event, z.object({ joined: z.boolean() }))

  if (!joined) {
    const ctx = await useAuthenticatedContext(event)
    return communityService.leave(ctx, mediaId)
  }

  const ctx = await useAuthenticatedContext(event)
  return communityService.join(ctx, mediaId)
})
