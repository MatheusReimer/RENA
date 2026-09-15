import { userService } from '@revy/core'
import { defineApiHandler } from '../utils/handler'
import { useServiceContext } from '../utils/context'
import { conversationService, notificationService } from '@revy/core'

/**
 * The current user (SPEC 26).
 *
 * Returns null rather than 401 when signed out: this is how the client decides
 * which UI to render, so "nobody is signed in" is a normal answer, not an error.
 *
 * The two unread counts ride along because the shell draws both badges on
 * every screen, and a second round trip for a number is a round trip the first
 * paint waits on.
 *
 * `messaging` says whether the deployment has an encryption key, so the
 * interface can leave the feature out rather than offering an entry point that
 * opens onto a 503. Reported from the live context rather than from build-time
 * config, because the key is an environment variable the deployed process
 * reads at runtime -- a flag baked at build time would be wrong on every host
 * that injects its secrets afterwards.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useServiceContext(event)
  const messaging = ctx.messageCipher !== null

  if (!ctx.viewerId) {
    return { user: null, unreadNotifications: 0, unreadMessages: 0, messaging }
  }

  const [user, unreadNotifications, unreadMessages] = await Promise.all([
    userService.getById(ctx, ctx.viewerId),
    notificationService.countUnread(ctx),
    conversationService.countUnread(ctx),
  ])

  return { user, unreadNotifications, unreadMessages, messaging }
})
