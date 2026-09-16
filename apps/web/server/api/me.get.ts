import { userService } from '@revy/core'
import { defineApiHandler } from '../utils/handler'
import { isViewerVerified, useServiceContext } from '../utils/context'
import { getAuthSession } from '../utils/auth'
import { verificationMailFailed } from '../utils/verification-mail'
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
 * `emailVerified` rides along for the same reason as the counts: it decides
 * whether the reader sees the product or the wall, on every route. Reported
 * here rather than kept on the profile, because it belongs to Better Auth's
 * table and a copy would go stale the moment somebody confirms.
 *
 * `verificationMailFailed` is what turns the wall from a dead end into a
 * problem with a name -- see `utils/verification-mail.ts`. Only looked up for
 * an account that is actually unconfirmed: for everybody else it is a storage
 * read whose answer cannot change what renders.
 *
 * Reaching this route does not require a confirmed address. It is how the
 * client learns it needs the wall, so putting it behind the wall would leave
 * the client unable to find out.
 *
 * `email` is the one place an address is sent to a browser, and it is sent
 * only while the account is unconfirmed. The wall has to print it -- "we sent
 * a link to matheus@exmaple.com" is how somebody catches the typo that is
 * actually keeping them out -- and this is the viewer's own session, so it is
 * their own address. It stays off `UserProfile`, which is rendered for other
 * people; the moment the address is confirmed this goes back to null.
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
      verificationMailFailed: false,
      email: null,
    }
  }

  const [user, unreadNotifications, unreadMessages, emailVerified] = await Promise.all([
    userService.getById(ctx, ctx.viewerId),
    notificationService.countUnread(ctx),
    conversationService.countUnread(ctx),
    isViewerVerified(event),
  ])

  const session = emailVerified ? null : await getAuthSession(event)
  const mailFailed = session?.user?.id ? await verificationMailFailed(session.user.id) : false

  return {
    user,
    unreadNotifications,
    unreadMessages,
    messaging,
    emailVerified,
    verificationMailFailed: mailFailed,
    email: session?.user?.email ?? null,
  }
})
