import { listService } from '@revy/core'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/** The viewer's own lists, every visibility (SPEC 15). */
export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)
  return { lists: await listService.listForUser(ctx, ctx.viewerId!) }
})
