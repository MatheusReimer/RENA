import { userService } from '@revy/core'
import { defineApiHandler } from '../utils/handler'
import { useServiceContext } from '../utils/context'
import { notificationService } from '@revy/core'

/**
 * The current user (SPEC 26).
 *
 * Returns null rather than 401 when signed out: this is how the client decides
 * which UI to render, so "nobody is signed in" is a normal answer, not an error.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useServiceContext(event)
  if (!ctx.viewerId) return { user: null, unreadNotifications: 0 }

  const [user, unreadNotifications] = await Promise.all([
    userService.getById(ctx, ctx.viewerId),
    notificationService.countUnread(ctx),
  ])

  return { user, unreadNotifications }
})
