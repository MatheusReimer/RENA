import { listService, userService } from '@revy/core'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/**
 * Another user's lists, filtered to what the viewer may see (SPEC 15).
 *
 * The visibility filter is applied in the query, so a private list never
 * leaves the database for the wrong viewer.
 */
export default defineApiHandler(async (event) => {
  const username = getRouterParam(event, 'username') ?? ''
  const ctx = await useServiceContext(event)

  const profile = await userService.getProfileByUsername(ctx, username)
  return { lists: await listService.listForUser(ctx, profile.id) }
})
