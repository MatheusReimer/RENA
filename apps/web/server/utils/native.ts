import { NATIVE_APP_ORIGINS } from '@revy/shared/constants'
import type { H3Event } from 'h3'

/**
 * Whether a request comes from one of the native apps (SPEC 4).
 *
 * Read from `Origin`, which a browser sets itself and page script cannot
 * forge. A non-browser client can claim anything, but it can also just send
 * the password, so nothing here is protecting against that caller.
 */
export function isNativeAppRequest(event: H3Event): boolean {
  const origin = getRequestHeader(event, 'origin')
  return origin !== undefined && NATIVE_APP_ORIGINS.includes(origin)
}
