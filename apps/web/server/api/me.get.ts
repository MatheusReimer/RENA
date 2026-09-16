import { userService } from '@revy/core'
import { defineApiHandler } from '../utils/handler'
import { isViewerVerified, useServiceContext } from '../utils/context'
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
 * `emailVerified` rides along for the same reason as the counts: the shell
 * draws the confirm-your-address banner on every screen, and the soft gate
 * decides which controls to offer. Reported here rather than kept on the
 * profile, because it belongs to Better Auth's table and a copy would go stale
 * the moment somebody confirms.
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
    return {
      user: null,
      unreadNotifications: 0,
      unreadMessages: 0,
      messaging,
      emailVerified: false,
    }
  }

  const [user, unreadNotifications, unreadMessages, emailVerified] = await Promise.all([
    userService.getById(ctx, ctx.viewerId),
    notificationService.countUnread(ctx),
    conversationService.countUnread(ctx),
    isViewerVerified(event),
  ])

  return { user, unreadNotifications, unreadMessages, messaging, emailVerified }
})
