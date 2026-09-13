import { useAuth } from '../../utils/auth'

/**
 * Better Auth's own endpoints: sign-in, sign-out, session, callbacks.
 *
 * Mounted as a catch-all so the library owns everything under /api/auth except
 * `register`, which sits alongside it and wraps sign-up with the domain user
 * creation (see ./register.post.ts).
 */
export default defineEventHandler((event) => {
  return useAuth().handler(toWebRequest(event))
})
