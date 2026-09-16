/**
 * Where a request for a screen should actually go, while an address is
 * unconfirmed (SPEC 26).
 *
 * A pure function rather than logic inside the route middleware, for two
 * reasons. It is the rule that decides whether somebody can use the product
 * at all, and a rule that important should be readable as a table and
 * testable without a browser. And the Capacitor build routes through the same
 * middleware, so there is one answer rather than one per shell.
 *
 * It is not the enforcement. `useAuthenticatedContext` on the server refuses
 * every authenticated route on its own, and would go on doing so if this file
 * were deleted -- what this decides is whether somebody meets an explanation
 * or a product where nothing works.
 */

/** The screen an unconfirmed account is held on. */
export const VERIFY_WALL_PATH = '/verify-email'

/**
 * Paths an unconfirmed account may still reach.
 *
 * The wall itself, and the credential screens -- signing out and starting
 * again with a different address is the only way out for somebody who typed
 * theirs wrong, and a password reset must not require the confirmation that
 * is currently failing.
 */
export const VERIFY_WALL_OPEN_PATHS: readonly string[] = [
  VERIFY_WALL_PATH,
  '/signin',
  '/signup',
  '/forgot-password',
  '/reset-password',
  /*
   * Settings, because deleting your account lives there.
   *
   * Somebody who signed up with a typo in their address can never confirm it,
   * and both stores require that leaving is possible from inside the app. A
   * wall that also blocks the exit would leave them holding an account they
   * can neither use nor remove.
   */
  '/settings',
]

export interface WallState {
  signedIn: boolean
  emailVerified: boolean
}

/**
 * The path to redirect to, or null to let the navigation through.
 *
 * Matches exactly, never by suffix: the i18n strategy here is `no_prefix`, so
 * there are no localised variants to be lenient about, and a suffix match
 * would open any route that happened to end in one of these words --
 * `/u/someone/signin` is a profile, not the sign-in screen.
 */
export function verifyWallRedirect(path: string, state: WallState): string | null {
  if (!state.signedIn) {
    // The wall is only a wall for somebody behind it. A signed-out visitor who
    // lands on it has no address to confirm and nothing to resend.
    return path === VERIFY_WALL_PATH ? '/signin' : null
  }

  if (state.emailVerified) {
    // Confirmed and still on the wall: they have just followed the link, or
    // confirmed in another tab and this one caught up. Put them in the
    // product rather than in front of a screen asking for what they have done.
    return path === VERIFY_WALL_PATH ? '/' : null
  }

  return VERIFY_WALL_OPEN_PATHS.includes(path) ? null : VERIFY_WALL_PATH
}
