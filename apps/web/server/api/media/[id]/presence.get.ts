import { mediaService } from '@revy/core'
import { getRouterParam } from 'h3'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/**
 * Who else here has been through this title (SPEC 9, 12).
 *
 * Public on purpose. A signed-out visitor seeing that eleven people here have
 * read the book in their hand is the best argument this page can make for
 * joining, and hiding it behind sign-in would mean the argument only reaches
 * people who have already accepted it.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useServiceContext(event)
  const id = getRouterParam(event, 'id')!

  return mediaService.getPresence(ctx, id)
})
