import { libraryCounts } from '@revy/core'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * The sidebar's library counters (SPEC 22).
 *
 * Its own endpoint, small on purpose: every signed-in screen that shows the
 * sidebar needs these six numbers and nothing else from the dashboard's
 * payload. Explore asking for the whole dashboard to fill a margin would mean
 * running the activity, friends, popular and recommendation queries to render
 * six integers.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)
  return libraryCounts(ctx.db, ctx.viewerId!)
})
