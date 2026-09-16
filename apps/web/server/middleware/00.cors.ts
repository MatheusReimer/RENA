import { NATIVE_APP_ORIGINS, SESSION_TOKEN_HEADER } from '@revy/shared/constants'
import { isNativeAppRequest } from '../utils/native'

/**
 * CORS for the native apps (SPEC 4).
 *
 * The website is same-origin and needs none of this. The apps serve their
 * bundle from `capacitor://localhost` or `https://localhost`, so without these
 * headers the WebView refuses every response, sign-in included.
 *
 * Numbered `00.` to run before the rate limiter: a preflight is the browser
 * asking permission, not a request, and charging it against the budget would
 * halve the allowance of every app user.
 *
 * Only the app origins get headers. h3's `handleCors` answers a request with no
 * `Origin` with `access-control-allow-origin: *`, so it is never called for
 * anything else -- the website's own API responses stay exactly as they were.
 *
 * No `credentials`: the apps authenticate with a bearer token, not a cookie, so
 * no response here is readable on the strength of somebody's cookie.
 */
export default defineEventHandler((event) => {
  if (!event.path.startsWith('/api/')) return

  if (!isNativeAppRequest(event)) {
    // Responses now differ by Origin, so a cache must not hand the website's
    // copy to an app. `handleCors` adds this itself on the other branch.
    appendResponseHeader(event, 'vary', 'origin')
    return
  }

  handleCors(event, {
    origin: [...NATIVE_APP_ORIGINS],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowHeaders: ['authorization', 'content-type', 'accept-language'],
    exposeHeaders: [SESSION_TOKEN_HEADER],
    maxAge: '600',
  })
})
