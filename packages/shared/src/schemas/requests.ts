import { z } from 'zod'
import { COMMENT_MAX_DEPTH, LIMITS, LIST_VISIBILITIES } from '../constants'
import {
  bioSchema,
  cursorPageSchema,
  displayNameSchema,
  emailSchema,
  mediaStatusSchema,
  mediaTypeSchema,
  ratingScoreSchema,
  userText,
  usernameSchema,
  uuidSchema,
} from './common'

/**
 * Request contracts for every mutating endpoint (SPEC 24, 25).
 *
 * One schema per endpoint, exported with its inferred type so handlers, the
 * API client and the forms all speak the same shape.
 */

/* ------------------------------------------------------------------ *
 * Auth (SPEC 26)
 * ------------------------------------------------------------------ */

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(8, 'Passwords must be at least 8 characters.')
    .max(128, 'Passwords must be at most 128 characters.'),
  username: usernameSchema,
  displayName: displayNameSchema,
})
export type SignUpInput = z.infer<typeof signUpSchema>

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
})
export type SignInInput = z.infer<typeof signInSchema>

/* ------------------------------------------------------------------ *
 * Profile (SPEC 22, 27)
 * ------------------------------------------------------------------ */

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    bio: bioSchema.nullable().optional(),
    avatarUrl: z.url({ error: 'Avatar must be a valid URL.' }).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    error: 'Nothing to update.',
  })
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/* ------------------------------------------------------------------ *
 * Media (SPEC 20)
 * ------------------------------------------------------------------ */

export const mediaSearchSchema = z.object({
  q: userText(LIMITS.searchQuery.min, LIMITS.searchQuery.max, 'Search term'),
  /** Omitted means 'all types'. */
  type: mediaTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
})
export type MediaSearchInput = z.infer<typeof mediaSearchSchema>

/**
 * Resolves a provider result into a local media row, creating it on first use.
 * This is how a search result becomes something you can rate.
 */
export const resolveMediaSchema = z.object({
  externalId: z.string().min(1).max(200),
  mediaType: mediaTypeSchema,
})
export type ResolveMediaInput = z.infer<typeof resolveMediaSchema>

/* ------------------------------------------------------------------ *
 * Consumption status (SPEC 9)
 * ------------------------------------------------------------------ */

export const setMediaStatusSchema = z.object({
  mediaId: uuidSchema,
  /** Null clears the status entirely. */
  status: mediaStatusSchema.nullable(),
  /**
   * How far in: episode number for series, page for books.
   *
   * Capped at a smallint because the column is one, and because a "page
   * 900000" is a typo rather than a book. Null leaves the existing value
   * alone; 0 clears it.
   */
  progress: z.number().int().min(0).max(32767).nullish(),
})
export type SetMediaStatusInput = z.infer<typeof setMediaStatusSchema>

/* ------------------------------------------------------------------ *
 * Ratings (SPEC 10)
 * ------------------------------------------------------------------ */

export const upsertRatingSchema = z.object({
  mediaId: uuidSchema,
  score: ratingScoreSchema,
})
export type UpsertRatingInput = z.infer<typeof upsertRatingSchema>

/* ------------------------------------------------------------------ *
 * Reviews (SPEC 11)
 * ------------------------------------------------------------------ */

export const createReviewSchema = z.object({
  mediaId: uuidSchema,
  content: userText(LIMITS.reviewContent.min, LIMITS.reviewContent.max, 'Review'),
  spoiler: z.boolean().default(false),
  /** Attaching a score rates the media in the same action. */
  score: ratingScoreSchema.nullish(),
})
export type CreateReviewInput = z.infer<typeof createReviewSchema>

export const updateReviewSchema = z.object({
  content: userText(LIMITS.reviewContent.min, LIMITS.reviewContent.max, 'Review').optional(),
  spoiler: z.boolean().optional(),
  score: ratingScoreSchema.nullish(),
})
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>

/* ------------------------------------------------------------------ *
 * Friends (SPEC 12)
 * ------------------------------------------------------------------ */

export const sendFriendRequestSchema = z.object({
  userId: uuidSchema,
})
export type SendFriendRequestInput = z.infer<typeof sendFriendRequestSchema>

export const respondToFriendRequestSchema = z.object({
  action: z.enum(['accept', 'reject']),
})
export type RespondToFriendRequestInput = z.infer<typeof respondToFriendRequestSchema>

/* ------------------------------------------------------------------ *
 * Discussions (SPEC 14)
 * ------------------------------------------------------------------ */

export const createThreadSchema = z.object({
  mediaId: uuidSchema,
  title: userText(LIMITS.discussionTitle.min, LIMITS.discussionTitle.max, 'Title'),
  spoiler: z.boolean().default(false),
  /** Optional opening comment, posted atomically with the thread. */
  content: userText(LIMITS.commentContent.min, LIMITS.commentContent.max, 'Message').optional(),
})
export type CreateThreadInput = z.infer<typeof createThreadSchema>

export const createCommentSchema = z.object({
  content: userText(LIMITS.commentContent.min, LIMITS.commentContent.max, 'Comment'),
  spoiler: z.boolean().default(false),
  /** Null posts at the top level. Nesting is capped at COMMENT_MAX_DEPTH. */
  parentCommentId: uuidSchema.nullish(),
})
export type CreateCommentInput = z.infer<typeof createCommentSchema>

export const commentDepthLimit = COMMENT_MAX_DEPTH

/* ------------------------------------------------------------------ *
 * Lists (SPEC 15)
 * ------------------------------------------------------------------ */

export const createListSchema = z.object({
  name: userText(LIMITS.listName.min, LIMITS.listName.max, 'List name'),
  description: userText(1, LIMITS.listDescription.max, 'Description').nullish(),
  visibility: z.enum(LIST_VISIBILITIES).default('private'),
})
export type CreateListInput = z.infer<typeof createListSchema>

/**
 * Declared explicitly rather than as `createListSchema.partial()`.
 *
 * `.partial()` makes fields optional but does NOT strip their defaults, so
 * `visibility`'s `.default('private')` survived it: a PATCH with an empty body
 * parsed to `{ visibility: 'private' }`, quietly making a public list private.
 * An update schema must never invent a value the caller did not send.
 */
export const updateListSchema = z
  .object({
    name: userText(LIMITS.listName.min, LIMITS.listName.max, 'List name').optional(),
    description: userText(1, LIMITS.listDescription.max, 'Description').nullish(),
    visibility: z.enum(LIST_VISIBILITIES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'Nothing to update.' })
export type UpdateListInput = z.infer<typeof updateListSchema>

export const addListItemSchema = z.object({
  mediaId: uuidSchema,
  note: userText(1, 280, 'Note').nullish(),
})
export type AddListItemInput = z.infer<typeof addListItemSchema>

export const reorderListSchema = z.object({
  /** Full ordered list of item ids. Simpler and more robust than deltas. */
  itemIds: z.array(uuidSchema).min(1).max(500),
})
export type ReorderListInput = z.infer<typeof reorderListSchema>

/* ------------------------------------------------------------------ *
 * Feed and notifications (SPEC 13, 23)
 * ------------------------------------------------------------------ */

export const feedQuerySchema = cursorPageSchema.extend({
  /** 'following' shows friends only; 'for-you' also mixes in your own. */
  scope: z.enum(['for-you', 'following']).default('for-you'),
})
export type FeedQueryInput = z.infer<typeof feedQuerySchema>

export const notificationQuerySchema = cursorPageSchema.extend({
  filter: z.enum(['all', 'friends', 'discussions', 'system']).default('all'),
})
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>

export const markNotificationsReadSchema = z.object({
  /** Omitted marks everything read. */
  ids: z.array(uuidSchema).max(200).optional(),
})
export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>
