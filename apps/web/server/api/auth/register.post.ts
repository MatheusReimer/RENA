import { userService } from '@revy/core'
import { schema } from '@revy/db'
import { signUpSchema } from '@revy/shared/schemas'
import { errors } from '@revy/shared/utils'
import { eq } from 'drizzle-orm'
import { useAuth } from '../../utils/auth'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/**
 * Registration (SPEC 26).
 *
 * Two records have to exist for a usable account: Better Auth's credential
 * record and our domain `users` row. Better Auth owns the first and cannot
 * know about the second, so this endpoint sequences them.
 *
 * The ordering is deliberate:
 *
 *  1. Check the username first, so the common failure (name taken) costs
 *     nothing and leaves nothing behind.
 *  2. Create the auth account.
 *  3. Create the domain user. If this loses a race for the username, the
 *     unique index rejects it and we delete the orphaned auth account rather
 *     than leaving an email that can never be registered again.
 *
 * A single transaction across both would be cleaner, but Better Auth manages
 * its own writes. This is the honest trade-off, with the failure path handled
 * rather than ignored.
 */
export default defineApiHandler(async (event) => {
  // Before any work: account creation is the expensive, abusable path.
  await assertRateLimit(event, RATE_LIMITS.register)

  const input = await readValidatedBodyOrThrow(event, signUpSchema)
  const ctx = await useServiceContext(event)

  if (!(await userService.isUsernameAvailable(ctx, input.username))) {
    throw errors.notFound('USERNAME_TAKEN', 'That username is already taken.')
  }

  const auth = useAuth()

  let authUserId: string
  /*
   * Better Auth's `Set-Cookie`, kept rather than discarded.
   *
   * `asResponse: false` alone returns the body and throws the headers away,
   * and the session cookie is one of those headers. The effect is a sign-up
   * that looks entirely successful -- 200, a user row, a session row in
   * `auth_session` -- while the browser is handed nothing. The reader is then
   * anonymous on the very next request, so `/onboarding` 401s on every call
   * and renders as though the catalogue were empty.
   *
   * `returnHeaders` keeps the typed result and hands back the headers to
   * forward. It has to be paired with `asResponse: false`; the two together
   * are what the overload resolves to `{ headers, response }`.
   */
  let authHeaders: Headers
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.displayName,
        /*
         * Where the confirmation link lands, and the reason onboarding still
         * happens at all.
         *
         * Sign-up used to go straight to `/onboarding`. It cannot now -- the
         * wall stands between the two, and `/onboarding` was the only route
         * into that screen anywhere in the app, so leaving the callback at
         * `/` would have quietly deleted the questions that feed the
         * recommender for every account created from here on.
         *
         * So the confirmation link lands exactly where sign-up used to send
         * them, one step later than before. `autoSignInAfterVerification`
         * means they arrive signed in and confirmed, which is the only state
         * in which the taste endpoints will answer them.
         */
        callbackURL: '/onboarding',
      },
      headers: event.headers,
      asResponse: false,
      returnHeaders: true,
    })
    if (!result.response) throw new Error('sign-up returned no user')
    authUserId = result.response.user.id
    authHeaders = result.headers
  } catch (error) {
    // Better Auth signals a duplicate email through its own error shape;
    // translate it into our envelope rather than leaking the library's.
    const message = error instanceof Error ? error.message : ''
    if (/already exists|already registered|USER_ALREADY_EXISTS/i.test(message)) {
      throw errors.notFound('EMAIL_TAKEN', 'An account with that email already exists.')
    }
    throw error
  }

  try {
    const user = await userService.createForAuthUser(ctx, {
      authUserId,
      username: input.username,
      displayName: input.displayName,
      language: input.language,
    })

    /*
     * Only now, on the success path.
     *
     * The rollback below deletes the auth account, and `auth_session` cascades
     * from it. Setting the cookie before that point would hand out a session
     * that is about to stop existing.
     */
    for (const cookie of authHeaders.getSetCookie()) {
      appendResponseHeader(event, 'set-cookie', cookie)
    }

    return { user }
  } catch (error) {
    // Roll back the auth account so the email is not permanently stranded.
    //
    // Deleted directly rather than through the auth API: Better Auth only
    // exposes user deletion via its admin plugin, which this app does not
    // enable. Sessions and credentials cascade from auth_user.
    try {
      await ctx.db.delete(schema.authUser).where(eq(schema.authUser.id, authUserId))
    } catch (cleanupError) {
      // The account is orphaned. Log loudly -- it needs manual attention --
      // but still give the user a correct error rather than a false success.
      console.error('[revy] failed to clean up orphaned auth user', authUserId, cleanupError)
    }
    throw error
  }
})
