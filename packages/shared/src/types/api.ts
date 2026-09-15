/**
 * Transport-level contracts shared by the API and every client (SPEC 35).
 *
 * These types describe the envelope, never the domain. Domain shapes live in
 * `./domain.ts`.
 */

/**
 * Machine-readable error codes. Clients switch on `code`; `message` is only
 * ever for humans and may change without notice.
 *
 * SPEC 35 requires a stable code alongside a friendly message, and SPEC 39
 * requires that internals never leak -- so every thrown error is mapped onto
 * one of these before it reaches a client.
 */
export const API_ERROR_CODES = [
  // auth / authz
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'SESSION_EXPIRED',
  // validation
  'VALIDATION_FAILED',
  'INVALID_RATING_SCORE',
  'USERNAME_TAKEN',
  'USERNAME_RESERVED',
  'EMAIL_TAKEN',
  // not found
  'NOT_FOUND',
  'MEDIA_NOT_FOUND',
  'USER_NOT_FOUND',
  'REVIEW_NOT_FOUND',
  'THREAD_NOT_FOUND',
  'COMMENT_NOT_FOUND',
  'LIST_NOT_FOUND',
  'CONVERSATION_NOT_FOUND',
  'MESSAGE_NOT_FOUND',
  // conflict / domain rules
  'CONFLICT',
  'ALREADY_FRIENDS',
  'FRIEND_REQUEST_EXISTS',
  'CANNOT_FRIEND_SELF',
  'REVIEW_ALREADY_EXISTS',
  'COMMENT_DEPTH_EXCEEDED',
  'MEDIA_NOT_RELEASED',
  'USER_BLOCKED',
  'NOT_FRIENDS',
  'MESSAGING_UNAVAILABLE',
  // infrastructure
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** The error envelope every failed request returns (SPEC 35). */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode
    message: string
    /**
     * Field-level detail for VALIDATION_FAILED only, keyed by dotted path.
     * Never populated for other codes, and never contains internals.
     */
    fields?: Record<string, string[]>
  }
}

/** Cursor-paginated collection response (SPEC 38). */
export interface Paginated<T> {
  items: T[]
  /** Opaque cursor for the next page; null when the list is exhausted. */
  nextCursor: string | null
}

/** Offset-paginated response, used where a total count is genuinely needed. */
export interface PaginatedWithTotal<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface CursorPageParams {
  cursor?: string | null
  limit?: number
}
