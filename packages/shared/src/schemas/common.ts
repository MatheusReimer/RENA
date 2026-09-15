import { z } from 'zod'
import {
  LIMITS,
  MEDIA_STATUSES,
  MEDIA_TYPES,
  PAGE_SIZE_DEFAULT,
  PAGE_SIZE_MAX,
  RATING_VALUES,
  RESERVED_USERNAMES,
} from '../constants'
import { normalizeUsername } from '../utils/format'

/**
 * Primitive schemas reused across every request contract (SPEC 25).
 *
 * Everything here is shared by the client (for UX) and the server (for
 * correctness). SPEC 25 is explicit that the server never trusts the client,
 * so these are re-run on every mutation regardless of what the form did.
 */

export const uuidSchema = z.uuid({ error: 'Invalid identifier.' })

export const mediaTypeSchema = z.enum(MEDIA_TYPES)
export const mediaStatusSchema = z.enum(MEDIA_STATUSES)

/** 0.5-5.0 in 0.5 steps, enforced as a literal union so 3.7 can never pass. */
export const ratingScoreSchema = z
  .number()
  .refine((value) => (RATING_VALUES as readonly number[]).includes(value), {
    error: 'Ratings must be between 0.5 and 5.0 in 0.5 steps.',
  })

export const usernameSchema = z
  .string()
  .trim()
  .min(LIMITS.username.min, `Usernames must be at least ${LIMITS.username.min} characters.`)
  .max(LIMITS.username.max, `Usernames must be at most ${LIMITS.username.max} characters.`)
  .regex(
    /^[a-zA-Z0-9_]+$/,
    'Usernames can only contain letters, numbers and underscores.',
  )
  .refine((value) => !RESERVED_USERNAMES.includes(normalizeUsername(value)), {
    error: 'That username is not available.',
  })

export const displayNameSchema = z
  .string()
  .trim()
  .min(LIMITS.displayName.min, 'Display name is required.')
  .max(LIMITS.displayName.max, `Display name must be at most ${LIMITS.displayName.max} characters.`)

export const bioSchema = z
  .string()
  .trim()
  .max(LIMITS.bio.max, `Bio must be at most ${LIMITS.bio.max} characters.`)

/**
 * The password rule, in one place.
 *
 * Extracted from `signUpSchema` when password reset was added, because the two
 * had to agree and nothing was making them: a reset form with a laxer rule
 * lets somebody set a password they could not have registered with, and a
 * stricter one rejects the password they already have. Same rule, one
 * definition.
 *
 * Length only. Composition rules -- a digit, a symbol, a capital -- push people
 * towards predictable substitutions and are no longer recommended (OWASP ASVS
 * 2.1); length is the property that actually costs an attacker anything.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Passwords must be at least 8 characters.')
  .max(128, 'Passwords must be at most 128 characters.')

export const emailSchema = z.email({ error: 'Enter a valid email address.' }).trim().toLowerCase()

/** Cursor pagination params, parsed from the query string (SPEC 38). */
export const cursorPageSchema = z.object({
  cursor: z.string().max(200).nullish(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_SIZE_MAX)
    .default(PAGE_SIZE_DEFAULT),
})

export type CursorPageInput = z.infer<typeof cursorPageSchema>

/**
 * Trims user text and rejects strings that are whitespace-only.
 *
 * User-generated content is stored raw and escaped at render time (SPEC 39);
 * we deliberately do not strip HTML here, because sanitising on input destroys
 * legitimate text and gives a false sense of safety.
 */
export function userText(min: number, max: number, label: string) {
  return z
    .string()
    .trim()
    .min(min, `${label} is required.`)
    .max(max, `${label} must be at most ${max} characters.`)
}
