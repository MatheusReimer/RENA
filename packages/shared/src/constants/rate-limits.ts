/**
 * Rate limit rules (SPEC 39).
 *
 * Configuration, so it lives here beside the other tuned numbers rather than
 * inside the server that enforces it -- the same reasoning that keeps
 * XP_REWARDS out of the services (SPEC 16). Enforcement is transport-level and
 * stays in the web app; these are just the values, importable by tests and by
 * anything that needs to explain a limit to a user.
 */

export interface RateLimitRule {
  /** Bucket name, so different rules on one route cannot share a counter. */
  bucket: string
  /** Requests allowed per window. */
  limit: number
  /** Window length in seconds. */
  windowSeconds: number
}

/**
 * Chosen against what each endpoint costs and what abusing it achieves, rather
 * than a uniform default: signing in is the brute-force target, search spends
 * someone else's API quota, and writes create content.
 */
export const RATE_LIMITS = {
  /** Every /api route, as a backstop. Generous: normal use never sees it. */
  global: { bucket: 'global', limit: 300, windowSeconds: 60 },

  /**
   * Credential endpoints. Deliberately strict -- this is the control that
   * makes online password guessing impractical (OWASP A07).
   */
  auth: { bucket: 'auth', limit: 10, windowSeconds: 900 },

  /** Registration, to blunt automated account creation. */
  register: { bucket: 'register', limit: 5, windowSeconds: 3600 },

  /** Search reaches external catalogues; this protects our provider quota. */
  search: { bucket: 'search', limit: 60, windowSeconds: 60 },

  /** Content creation: reviews, discussions, comments, lists. */
  write: { bucket: 'write', limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitName = keyof typeof RATE_LIMITS
