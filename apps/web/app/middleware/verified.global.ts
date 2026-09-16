import { verifyWallRedirect } from '@revy/shared/utils'

/**
 * The wall: a signed-in account with an unconfirmed address sees one screen.
 *
 * This is a courtesy, not the enforcement. `useAuthenticatedContext` refuses
 * every authenticated route on the server and would go on refusing them with
 * this file deleted -- what this adds is that somebody meets an explanation
 * and a Resend button instead of a product where every action fails.
 *
 * Global rather than opt-in per page. The opposite of how the server does it,
 * and deliberately: on the server a route that forgets the check is a hole,
 * so the check has to be asked for. Here a route that forgets it is merely a
 * screen that renders empty behind a wall that is already up, and listing
 * twenty pages to gate would be a list somebody has to remember to add to.
 *
 * The decision itself is `verifyWallRedirect`, in `@revy/shared` -- a rule
 * this load-bearing is worth having as a table that can be tested without a
 * browser, and the Capacitor build routes through the same one.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  /*
   * Server-side this runs before the session is known and would redirect
   * everybody, signed in or not, on the very first render. The client picks it
   * up immediately afterwards with a session in hand.
   */
  if (import.meta.server) return

  const auth = useAuthStore()
  await auth.load()

  const target = verifyWallRedirect(to.path, {
    signedIn: auth.isSignedIn,
    emailVerified: auth.emailVerified,
  })

  return target ? navigateTo(target) : undefined
})
