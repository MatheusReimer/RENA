import type { ApiErrorCode } from '../types/api'

/**
 * What to tell somebody when an action is refused, and what they can do next.
 *
 * Every refusal in the product resolves to one of these. The rule is that a
 * block must always name its cause and offer the step that clears it -- a
 * control that fails without saying why is indistinguishable from a control
 * that is broken, and the reader cannot tell whether to retry, wait, fix
 * something or give up.
 *
 * This is the table rather than the copy: it maps a code to an i18n key and,
 * where one exists, to the route that fixes it. The strings live in the locale
 * files, because the server's own `message` is written for an operator and is
 * English regardless of who is reading it.
 *
 * Pure, and in `shared`, so the mapping can be tested without a browser and so
 * the Capacitor build cannot drift from the web one.
 */

export interface BlockReason {
  /** i18n key for the sentence explaining what happened. */
  messageKey: string
  /** i18n key for the button that clears it, when the reader can clear it. */
  actionKey?: string
  /** Where that button goes. */
  to?: string
  /**
   * True when waiting is the fix rather than doing something. The surface uses
   * this to avoid offering a button that would only repeat the failure.
   */
  retryable?: boolean
}

/**
 * Codes that are the reader's own form to fix, field by field. These never
 * reach the notice surface -- the form shows them against the inputs, which is
 * closer to the mistake than a message in the corner of the screen.
 */
const FIELD_LEVEL: ReadonlySet<string> = new Set([
  'VALIDATION_FAILED',
  'INVALID_RATING_SCORE',
  'USERNAME_TAKEN',
  'USERNAME_RESERVED',
  'EMAIL_TAKEN',
])

export function isFieldLevel(code: ApiErrorCode): boolean {
  return FIELD_LEVEL.has(code)
}

const REASONS: Partial<Record<ApiErrorCode, BlockReason>> = {
  /*
   * The case this whole table was written for.
   *
   * Pressing "Add friend" on an unconfirmed account used to fail and say
   * nothing at all -- the button stopped spinning and the screen was exactly
   * as it had been. The address is confirmable in two taps, so the block is
   * only ever a dead end if nobody mentions it.
   */
  EMAIL_NOT_VERIFIED: {
    messageKey: 'block.emailNotVerified',
    actionKey: 'block.confirmEmail',
    to: '/verify-email',
  },

  UNAUTHENTICATED: { messageKey: 'block.signInNeeded', actionKey: 'nav.signIn', to: '/signin' },
  SESSION_EXPIRED: { messageKey: 'block.sessionExpired', actionKey: 'nav.signIn', to: '/signin' },

  FORBIDDEN: { messageKey: 'block.forbidden' },
  USER_BLOCKED: { messageKey: 'block.userBlocked' },
  NOT_FRIENDS: { messageKey: 'block.notFriends' },

  ALREADY_FRIENDS: { messageKey: 'block.alreadyFriends' },
  FRIEND_REQUEST_EXISTS: { messageKey: 'block.requestPending' },
  CANNOT_FRIEND_SELF: { messageKey: 'block.cannotFriendSelf' },
  REVIEW_ALREADY_EXISTS: { messageKey: 'block.reviewExists' },
  COMMENT_DEPTH_EXCEEDED: { messageKey: 'block.commentDepth' },
  MEDIA_NOT_RELEASED: { messageKey: 'block.notReleased' },

  MESSAGING_UNAVAILABLE: { messageKey: 'block.messagingUnavailable' },

  /* Waiting is the fix, so these say so rather than offering a button that
     would only produce the same failure again. */
  RATE_LIMITED: { messageKey: 'block.rateLimited', retryable: true },
  PROVIDER_UNAVAILABLE: { messageKey: 'block.providerUnavailable', retryable: true },
  INTERNAL_ERROR: { messageKey: 'block.internal', retryable: true },

  CONFLICT: { messageKey: 'block.conflict', retryable: true },

  /* "It is gone" reads the same whatever kind of thing it was, and naming the
     kind would only tell somebody which of our tables it was missing from. */
  NOT_FOUND: { messageKey: 'block.gone' },
  MEDIA_NOT_FOUND: { messageKey: 'block.gone' },
  USER_NOT_FOUND: { messageKey: 'block.gone' },
  REVIEW_NOT_FOUND: { messageKey: 'block.gone' },
  THREAD_NOT_FOUND: { messageKey: 'block.gone' },
  COMMENT_NOT_FOUND: { messageKey: 'block.gone' },
  LIST_NOT_FOUND: { messageKey: 'block.gone' },
  CONVERSATION_NOT_FOUND: { messageKey: 'block.gone' },
  MESSAGE_NOT_FOUND: { messageKey: 'block.gone' },
}

/**
 * The reason for a code, or the generic one.
 *
 * Never returns null for an unknown code: a refusal nobody anticipated still
 * has to say something, and "something went wrong, try again" is a worse
 * message than the specific ones above but an enormously better one than a
 * button that quietly does nothing.
 */
export function blockReason(code: ApiErrorCode | undefined): BlockReason {
  if (code && REASONS[code]) return REASONS[code]
  return { messageKey: 'block.internal', retryable: true }
}
