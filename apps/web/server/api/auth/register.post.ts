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
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: input.email,
        password: input.password,
        name: input.displayName,
      },
      headers: event.headers,
      asResponse: false,
    })
    authUserId = result.user.id
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
