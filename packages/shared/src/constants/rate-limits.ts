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

  /*
   * Sending a direct message (SPEC 12).
   *
   * Its own bucket rather than sharing `write`, and the reason is the shape of
   * the traffic: a real back-and-forth is bursty in a way that posting reviews
   * never is, and a chat that stops working because you also wrote a review
   * this minute is a bug the user cannot explain. Sixty a minute is far past
   * conversational speed and still bounds a script.
   *
   * This is a flood control, not the anti-harassment control -- that is the
   * friends-only rule and the block check, both enforced in the service.
   */
  message: { bucket: 'message', limit: 60, windowSeconds: 60 },

  /*
   * Described-request discovery (SPEC 40).
   *
   * By far the strictest non-credential limit, and the reason is that this is
   * the only route where a single request spends real money on our side rather
   * than a quota or a database row.
   *
   * Raised from twenty when discovery became a conversation. It counts *turns*
   * now, not questions asked: a request that gets narrowed twice before it is
   * answered costs three calls, so twenty would have meant six conversations
   * an hour -- a limit a curious person hits on their first evening. Sixty
   * keeps roughly the same fifteen-to-twenty complete conversations the
   * original number was chosen for.
   *
   * The per-turn cost is lower than it looks: within one conversation the
   * catalogue block is a cached prompt prefix, so only the first turn pays for
   * it in full.
   */
  discovery: { bucket: 'discovery', limit: 60, windowSeconds: 3600 },

  /*
   * Translating a review (SPEC 31).
   *
   * Looser than discovery, and the difference is the cache. A described
   * request is unique every time and costs a call every time; a translation is
   * paid for once per review per language, however many people then read it.
   * So this bounds how fast one person can reach *untranslated* reviews, not
   * how much they can read.
   *
   * It must stay above `discovery`, and that ordering is asserted by a test
   * rather than left to memory -- raising discovery to sixty when it became a
   * conversation silently inverted the relationship the first time, which is
   * exactly the kind of change nobody notices until the cheaper call is the
   * one being refused.
   */
  translate: { bucket: 'translate', limit: 120, windowSeconds: 3600 },

  /*
   * Resolving a provider result into a local row (SPEC 8).
   *
   * This had no limit at all, which made it the widest hole in the set: it is
   * open to signed-out callers, it calls the same external catalogues that
   * `search` is limited specifically to protect, and unlike `search` it
   * *writes* -- every call can insert a `media` row. So an anonymous script
   * could burn the provider quota and grow the catalogue at the same time.
   *
   * Tighter than `search` because opening results is a slower activity than
   * typing into a box, and because this one costs a write.
   */
  resolve: { bucket: 'resolve', limit: 30, windowSeconds: 60 },

  /*
   * Live username availability on the signup form.
   *
   * Cheap per call and unbounded before this, which made it a free oracle for
   * "does this account exist" and a free database query for anyone who wanted
   * a few million. Usernames are public on profiles either way, so the point
   * is the rate, not the secrecy.
   *
   * Generous, because a person filling in a form legitimately fires one of
   * these per keystroke.
   */
  usernameCheck: { bucket: 'username-check', limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>

export type RateLimitName = keyof typeof RATE_LIMITS
