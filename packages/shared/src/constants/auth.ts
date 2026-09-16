/**
 * Authentication link lifetimes (SPEC 26).
 *
 * Here rather than in the server that enforces them, for the same reason as
 * RATE_LIMITS: the number has to be stated twice -- once where Better Auth is
 * configured, and once in the sentence that tells somebody how long they have.
 * Two literals drift, and the copy is the half nobody remembers to update, so
 * the screen quietly starts lying about the product's behaviour.
 */

/** How long a password-reset or address-confirmation link stays valid. */
export const AUTH_LINK_TTL_SECONDS = 60 * 60

/** The same figure in minutes, for copy that counts in minutes. */
export const AUTH_LINK_TTL_MINUTES = AUTH_LINK_TTL_SECONDS / 60

/**
 * How long the "send it again" button stays disabled.
 *
 * Long enough that a second tap is a considered act rather than impatience --
 * most mail lands inside a minute, and a resend before that only doubles the
 * copies arriving. Well inside the `auth` rate limit, so somebody using the
 * button as intended never meets a 429.
 */
export const AUTH_RESEND_COOLDOWN_SECONDS = 60

/**
 * Minimum password length.
 *
 * Length only -- composition rules push people towards predictable
 * substitutions and are no longer recommended (OWASP ASVS 2.1). Shared because
 * `passwordSchema` enforces it and three screens have to state it; a hint that
 * disagrees with the validator is a form that rejects what it just asked for.
 */
export const PASSWORD_MIN_LENGTH = 8
