import type { ApiErrorBody, ApiErrorCode } from '../types/api'

/**
 * The single error type the domain throws (SPEC 35, 39).
 *
 * Services throw `DomainError`; the API layer is the only thing that knows how
 * to turn one into an HTTP response. Anything that is *not* a DomainError is
 * treated as a bug and reported as INTERNAL_ERROR with no detail, so stack
 * traces and driver messages can never reach a client.
 */
export class DomainError extends Error {
  readonly code: ApiErrorCode
  readonly status: number
  readonly fields: Record<string, string[]> | undefined

  constructor(
    code: ApiErrorCode,
    message: string,
    options?: { status?: number; fields?: Record<string, string[]>; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'DomainError'
    this.code = code
    this.status = options?.status ?? statusForCode(code)
    this.fields = options?.fields
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fields ? { fields: this.fields } : {}),
      },
    }
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

/** Default HTTP status for each error code. */
export function statusForCode(code: ApiErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
    case 'SESSION_EXPIRED':
      return 401
    case 'FORBIDDEN':
    case 'USER_BLOCKED':
      return 403
    case 'NOT_FOUND':
    case 'MEDIA_NOT_FOUND':
    case 'USER_NOT_FOUND':
    case 'REVIEW_NOT_FOUND':
    case 'THREAD_NOT_FOUND':
    case 'COMMENT_NOT_FOUND':
    case 'LIST_NOT_FOUND':
    case 'CONVERSATION_NOT_FOUND':
    case 'MESSAGE_NOT_FOUND':
      return 404
    case 'CONFLICT':
    case 'ALREADY_FRIENDS':
    case 'FRIEND_REQUEST_EXISTS':
    case 'REVIEW_ALREADY_EXISTS':
    case 'USERNAME_TAKEN':
    case 'EMAIL_TAKEN':
      return 409
    case 'VALIDATION_FAILED':
    case 'INVALID_RATING_SCORE':
    case 'MEDIA_NOT_RELEASED':
    case 'USERNAME_RESERVED':
    case 'CANNOT_FRIEND_SELF':
    case 'COMMENT_DEPTH_EXCEEDED':
    case 'NOT_FRIENDS':
      return 422
    case 'RATE_LIMITED':
      return 429
    case 'PROVIDER_UNAVAILABLE':
    case 'MESSAGING_UNAVAILABLE':
      return 503
    case 'INTERNAL_ERROR':
      return 500
    default:
      return 400
  }
}

/* ------------------------------------------------------------------ *
 * Constructors for the errors thrown most often, so call sites stay short
 * and messages stay consistent.
 * ------------------------------------------------------------------ */

export const errors = {
  unauthenticated: () => new DomainError('UNAUTHENTICATED', 'You must be signed in to do that.'),

  forbidden: (message = 'You do not have permission to do that.') =>
    new DomainError('FORBIDDEN', message),

  notFound: (code: ApiErrorCode = 'NOT_FOUND', message = 'Not found.') =>
    new DomainError(code, message),

  mediaNotFound: () => new DomainError('MEDIA_NOT_FOUND', 'Media item not found.'),

  userNotFound: () => new DomainError('USER_NOT_FOUND', 'User not found.'),

  validation: (fields: Record<string, string[]>, message = 'Some fields need attention.') =>
    new DomainError('VALIDATION_FAILED', message, { fields }),

  invalidScore: () =>
    new DomainError('INVALID_RATING_SCORE', 'Ratings must be between 0.5 and 5.0 in 0.5 steps.'),

  /**
   * Guards every opinion an unreleased title cannot have had yet.
   *
   * The UI hides these controls, so reaching this means either a stale page
   * or a direct call -- both of which have to be refused here, because the
   * client is not where this rule can live.
   */
  notReleased: (what = 'rate') =>
    new DomainError('MEDIA_NOT_RELEASED', `You cannot ${what} something that is not out yet.`),

  rateLimited: (message = 'Too many requests. Try again shortly.') =>
    new DomainError('RATE_LIMITED', message),

  providerUnavailable: (provider: string) =>
    new DomainError('PROVIDER_UNAVAILABLE', `The ${provider} catalogue is unavailable right now.`),

  /** Messaging is friends-only (SPEC 12), and this is the whole of the rule. */
  notFriends: () =>
    new DomainError('NOT_FRIENDS', 'You can only message people you are friends with.'),

  /**
   * No message encryption key is configured, so there is nowhere safe to put
   * the text.
   *
   * Refusing is the only correct response: the alternative is writing private
   * messages to Postgres in plaintext because an environment variable was
   * missing, which is a silent downgrade of the one property this feature
   * promises. See `createMessageCipher`.
   */
  messagingUnavailable: () =>
    new DomainError('MESSAGING_UNAVAILABLE', 'Messaging is unavailable right now.'),

  internal: (cause?: unknown) =>
    new DomainError('INTERNAL_ERROR', 'Something went wrong on our end.', { cause }),
}
