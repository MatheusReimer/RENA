/**
 * Reporting and blocking (SPEC 1.2 of the App Store review guidelines, which
 * is not a SPEC section here but is the reason this exists).
 *
 * Both stores refuse an app carrying other people's writing unless a reader
 * can report what they are shown and block whoever wrote it. That makes these
 * a shipping requirement rather than a feature, and the shapes below are the
 * ones the report form, the API schema and the database enum all read from.
 */

/** What a report points at. */
export const REPORT_TARGETS = ['review', 'comment', 'thread', 'message', 'user', 'list'] as const

export type ReportTarget = (typeof REPORT_TARGETS)[number]

/**
 * Why it was reported.
 *
 * Deliberately short. A long list reads as a form to fill in and pushes people
 * towards "other"; these six cover what a reader can actually judge from a
 * piece of text, and the free-text note carries the rest.
 */
export const REPORT_REASONS = [
  'spam',
  'harassment',
  'hate',
  'sexual',
  'violence',
  'spoiler',
  'other',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

/**
 * Where a report is in its life.
 *
 * `open` until somebody looks at it. The guideline asks for action within 24
 * hours of a report, so this column is what says whether that happened.
 */
export const REPORT_STATUSES = ['open', 'actioned', 'dismissed'] as const

export type ReportStatus = (typeof REPORT_STATUSES)[number]

/** Longest free-text note a reporter can add. */
export const REPORT_NOTE_MAX = 500

/**
 * The display name a deleted account is shown under.
 *
 * Deleting an account anonymises it rather than erasing the rows: a discussion
 * where the opening post vanished is unreadable for everybody who replied to
 * it. The person is gone -- credentials, profile, messages, friendships -- and
 * what they wrote in public stays, under this name.
 */
export const DELETED_ACCOUNT_NAME = 'Deleted account'

/** Username prefix for an anonymised account; the suffix keeps it unique. */
export const DELETED_ACCOUNT_PREFIX = 'deleted-'

/**
 * The address on the privacy policy and in both store listings.
 *
 * Published, so it has to be one somebody reads. The server sends reports to
 * whatever `MODERATION_EMAIL` is set to, which should be this or forward to
 * it -- a contact address in a policy that reaches nobody is worse than none,
 * because it is a promise.
 */
export const MODERATION_EMAIL = 'privacy@rena.reviews'

/**
 * When the privacy policy last changed, as the page prints it.
 *
 * A constant rather than a build date: it should change when the text changes,
 * not when the site is deployed, or the page quietly claims a policy was
 * revised every time anything else ships.
 */
export const PRIVACY_UPDATED = '2026-09-16'
