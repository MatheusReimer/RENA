import { useAuth, getAuthSession } from '../../utils/auth'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'

/**
 * Sends another confirmation email, to the signed-in address (SPEC 26).
 *
 * Better Auth already serves `/send-verification-email` through the catch-all,
 * and this exists because that one takes the address from the request body.
 * Two things follow from that which are worth avoiding:
 *
 *  - it will mail anybody. The catch-all rate-limits it, so it is bounded
 *    rather than open, but a bounded way to send mail to a stranger from your
 *    domain is still a way to do it. Here the address comes from the session
 *    and the body is ignored entirely.
 *  - the client would have to know its own email to call it, which means
 *    putting an address on the session payload the whole interface reads.
 *    `UserProfile` deliberately has no `email` field -- profiles are rendered
 *    for other people, and a profile carrying an address leaks one to every
 *    visitor. Reading it here keeps it server-side.
 *
 * Always answers the same way. Better Auth does not report whether the address
 * was already confirmed, and neither does this: an error for "already done"
 * reads as a fault when it is the outcome the reader wanted.
 */
export default defineApiHandler(async (event) => {
  // Establishes the session, and refuses anonymous callers outright.
  await useAuthenticatedContext(event)
  await assertRateLimit(event, RATE_LIMITS.auth)

  const session = await getAuthSession(event)
  const email = session?.user?.email
  if (!email) return { sent: true }

  // Already confirmed: nothing to send, and saying so would be a difference
  // the caller could measure.
  if (session.user.emailVerified) return { sent: true }

  try {
    await useAuth().api.sendVerificationEmail({
      body: { email, callbackURL: '/' },
      headers: event.headers,
    })
  } catch (error) {
    // Logged, not surfaced. A provider outage is ours to fix, and the reader
    // can do nothing with it but try again -- which the cooldown already
    // paces. The address is left out: this lands in a shared log.
    console.error(
      '[revy] confirmation resend failed;',
      error instanceof Error ? error.message : error,
    )
  }

  return { sent: true }
})
