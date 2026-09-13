import { communityService } from '@revy/core'
import { z } from 'zod'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../utils/handler'

/**
 * Communities (SPEC 14).
 *
 * `scope=joined` needs a session; `active` is public, because a community is
 * only worth joining if you can see it first.
 */
export default defineApiHandler(async (event) => {
  const { scope } = readValidatedQueryOrThrow(
    event,
    z.object({ scope: z.enum(['active', 'joined']).default('active') }),
  )
  const ctx = await useServiceContext(event)

  if (scope === 'joined') {
    return { communities: await communityService.listJoined(ctx) }
  }
  return { communities: await communityService.listActive(ctx) }
})
