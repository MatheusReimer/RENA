import { SESSION_TOKEN_HEADER } from '@revy/shared/constants'
import { useAuth } from '../../utils/auth'
import { sendDomainError } from '../../utils/handler'
import { isNativeAppRequest } from '../../utils/native'
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
/*
 * Paths these limits apply to, and they must match the library's actual routes.
 *
 * This listed `/forget-password`, which Better Auth does not serve -- the route
 * is `/request-password-reset`. The effect was that the one endpoint that mails
 * a bearer token to an arbitrary address was the one endpoint with no limit on
 * it, which is both a spam vector and a way to probe for accounts at speed.
 *
 * `/send-verification-email` is here for the same reason: it also sends mail on
 * demand to an address chosen by the caller.
 */
const CREDENTIAL_PATHS = [
  '/sign-in',
  '/sign-up',
  '/reset-password',
  '/request-password-reset',
  '/send-verification-email',
]

export default defineEventHandler(async (event) => {
  try {
    if (CREDENTIAL_PATHS.some((path) => event.path.includes(path))) {
      await assertRateLimit(event, RATE_LIMITS.auth)
    }
  } catch (error) {
    return sendDomainError(event, error)
  }

  const response = await useAuth().handler(toWebRequest(event))

  /*
   * The session token, kept away from the website.
   *
   * The bearer plugin adds it to every response that sets the session cookie,
   * as a header page script can read. The cookie is httpOnly so that an
   * injected script cannot carry a session off-site; handing the same value
   * over in a readable header would quietly undo that. Only the native apps,
   * which have no cookie to fall back on, get to see it.
   */
  if (!isNativeAppRequest(event)) {
    response.headers.delete(SESSION_TOKEN_HEADER)
  }

  return response
})
