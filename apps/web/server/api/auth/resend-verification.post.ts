import { useAuth, getAuthSession } from '../../utils/auth'
import { useUnverifiedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'
import { clearVerificationMailFailure } from '../../utils/verification-mail'

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
 * Reports whether the mail actually went.
 *
 * It used to answer `{ sent: true }` whatever happened, and log the failure.
 * That was defensible while an unconfirmed account still worked: the reader
 * could do nothing with a provider outage, and the cooldown already paced the
 * retries. It is not defensible now. Confirming is a wall, so a send that
 * fails silently is an account that is locked out with no explanation and no
 * way to tell a slow inbox from an outage -- and the confirmation mail has
 * failed on this deployment before, on an unverified sending domain.
 *
 * "Already confirmed" still answers `sent: true`. That is not a failure, it is
 * the outcome the reader wanted, and it is the one case where saying nothing
 * is the honest answer.
 *
 * The provider's message is deliberately not forwarded. It is written for an
 * operator, it can name infrastructure, and the reader's next move is the same
 * whatever it says.
 */
export default defineApiHandler(async (event) => {
  /*
   * The one context that accepts an unconfirmed session, and the reason that
   * context exists: the endpoint whose whole job is getting somebody past the
   * wall cannot be behind it.
   */
  await useUnverifiedContext(event)
  await assertRateLimit(event, RATE_LIMITS.auth)

  const session = await getAuthSession(event)
  const email = session?.user?.email
  if (!email) return { sent: true }

  // Already confirmed: nothing to send, and saying so would be a difference
  // the caller could measure.
  if (session.user.emailVerified) return { sent: true }

  try {
    await useAuth().api.sendVerificationEmail({
      // Same destination as the link sent at sign-up; see `register.post.ts`.
      body: { email, callbackURL: '/onboarding' },
      headers: event.headers,
    })
  } catch (error) {
    // The address is left out of the log line: this lands in a shared
    // aggregator, and it says who is currently unable to get in.
    console.error(
      '[revy] confirmation resend failed;',
      error instanceof Error ? error.message : error,
    )
    return { sent: false }
  }

  await clearVerificationMailFailure(session.user.id)
  return { sent: true }
})
