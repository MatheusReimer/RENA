import { useAuth } from '../../utils/auth'
import { sendDomainError } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'

/**
 * Better Auth's own endpoints: sign-in, sign-out, session, callbacks.
 *
 * Mounted as a catch-all so the library owns everything under /api/auth except
 * `register`, which sits alongside it and wraps sign-up with the domain user
 * creation (see ./register.post.ts).
 *
 * Credential operations get the strict limit; session reads do not, because
 * every page load performs one and they are not a brute-force target.
 *
 * This is a plain event handler rather than `defineApiHandler` -- Better Auth
 * needs the raw Request/Response -- so the error envelope is applied by hand
 * (SPEC 35, 39).
 */
const CREDENTIAL_PATHS = ['/sign-in', '/sign-up', '/reset-password', '/forget-password']

export default defineEventHandler(async (event) => {
  try {
    if (CREDENTIAL_PATHS.some((path) => event.path.includes(path))) {
      await assertRateLimit(event, RATE_LIMITS.auth)
    }
  } catch (error) {
    return sendDomainError(event, error)
  }

  return useAuth().handler(toWebRequest(event))
})
