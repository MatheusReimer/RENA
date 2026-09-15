import { z } from 'zod'
import type { MediaType } from '../types/domain'
import {
  ACTIVITY_TYPES,
  COMMENT_MAX_DEPTH,
  CONTENT_LANGUAGES,
  DISCOVERY_MAX_QUESTIONS,
  LIMITS,
  LIST_VISIBILITIES,
  MESSAGE_PAGE_SIZE,
  MESSAGE_POLL_MAX,
  MEDIA_TYPES,
} from '../constants'
import {
  bioSchema,
  cursorPageSchema,
  displayNameSchema,
  emailSchema,
  passwordSchema,
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
  password: passwordSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  /*
   * The language this person reads and writes in (SPEC 31).
   *
   * Asked at sign-up rather than inferred, because the answer does two jobs a
   * guess would get wrong: it sets their interface on every device, and it is
   * what their own reviews are recorded as being written in. Attributing a
   * translation to the wrong source language is worse than not translating at
   * all.
   *
   * Optional, and the form preselects whatever the browser already suggested,
   * so the common case is confirming rather than choosing.
   */
  language: z.enum(CONTENT_LANGUAGES).optional(),
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
  /**
   * What language this is written in.
   *
   * Sent by the client from the interface locale rather than detected from the
   * text: detection is unreliable on two sentences, and the person writing
   * already told us which language they are in by choosing one.
   */
  language: z.enum(CONTENT_LANGUAGES).optional(),
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
 * Direct messages (SPEC 12)
 * ------------------------------------------------------------------ */

/**
 * Opens a conversation with someone, or returns the existing one.
 *
 * Takes the other person's user id rather than a conversation id, because from
 * the client's side "message Ana" is the action -- whether a thread already
 * exists is something the server knows and the profile page does not.
 */
export const startConversationSchema = z.object({
  userId: uuidSchema,
})
export type StartConversationInput = z.infer<typeof startConversationSchema>

export const sendMessageSchema = z.object({
  content: userText(LIMITS.messageContent.min, LIMITS.messageContent.max, 'Message'),
})
export type SendMessageInput = z.infer<typeof sendMessageSchema>

/**
 * Reading a thread, in the two directions it is read in.
 *
 * `before` pages backwards through history and `after` is what the poll sends
 * every few seconds; they are mutually exclusive because a request carrying
 * both is a client bug, and answering it with something plausible would hide
 * that. Both are message ids, not timestamps -- two messages can share a
 * millisecond, and a timestamp cursor would then drop or repeat one.
 */
export const messageQuerySchema = z
  .object({
    before: uuidSchema.nullish(),
    after: uuidSchema.nullish(),
    limit: z.coerce.number().int().min(1).max(MESSAGE_POLL_MAX).default(MESSAGE_PAGE_SIZE),
  })
  .refine((value) => !(value.before && value.after), {
    error: 'Pass either before or after, not both.',
    path: ['after'],
  })
export type MessageQueryInput = z.infer<typeof messageQuerySchema>

/**
 * Marks a conversation read up to a message.
 *
 * Takes the id the client actually has on screen rather than "now": the reader
 * has seen up to the bottom of what was rendered, and anything that arrived
 * between the render and this request has not been read yet. Sending a
 * timestamp would quietly mark those read too.
 */
export const markConversationReadSchema = z.object({
  messageId: uuidSchema,
})
export type MarkConversationReadInput = z.infer<typeof markConversationReadSchema>

/* ------------------------------------------------------------------ *
 * Feed and notifications (SPEC 13, 23)
 * ------------------------------------------------------------------ */

export const feedQuerySchema = cursorPageSchema.extend({
  /** 'following' shows friends only; 'for-you' also mixes in your own. */
  scope: z.enum(['for-you', 'following']).default('for-you'),
  /**
   * Narrows the feed to one kind of event.
   *
   * Orthogonal to `scope`, which chooses *whose* activity: this chooses
   * *which*. Omitted means everything, which is what the home feed wants; the
   * friends screen passes `rated_media` to get a wall of scores and nothing
   * else.
   *
   * An enum rather than a free string because it reaches a SQL predicate, and
   * because the set of things that can appear in a feed is closed.
   */
  type: z.enum(ACTIVITY_TYPES).optional(),
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

/* ------------------------------------------------------------------ *
 * Natural language discovery (SPEC 40)
 * ------------------------------------------------------------------ */

export const discoveryAskSchema = z.object({
  /*
   * A sentence, and the ceiling says so.
   *
   * Three hundred characters is roughly three sentences: long enough for
   * "something under two hours, not too heavy, that my girlfriend would sit
   * through", short enough that nobody pastes an essay into a field we forward
   * to a paid API. The limit is a cost control as much as a validation.
   */
  request: userText(3, 300, 'Your description'),
  /** Which language to answer in; falls back to English. */
  language: z.enum(CONTENT_LANGUAGES).optional(),
  /*
   * The refinement so far, oldest first.
   *
   * The transcript lives on the client and is resent each turn rather than
   * held in a table. Two reasons: a conversation that is abandoned halfway --
   * which most will be -- leaves nothing to clean up, and the server stays
   * stateless, which is what lets this run on a serverless host without a
   * session store.
   *
   * The question text is therefore supplied by the client, and a crafted
   * transcript could put words in our mouth. That is bounded and accepted: the
   * model still answers with positions into a candidate list the server built,
   * so the worst outcome is a poor recommendation for the person who forged
   * it. Nothing here reaches another reader.
   */
  answers: z
    .array(
      z.object({
        question: userText(1, 200, 'Question'),
        answer: userText(1, 120, 'Answer'),
        /** Set when the reader declined to narrow rather than choosing. */
        skipped: z.boolean().default(false),
        /** The axis it covered, echoed back so it is not asked twice. */
        dimension: z.string().trim().max(40).optional(),
      }),
    )
    .max(DISCOVERY_MAX_QUESTIONS)
    .default([]),
  /** "Just show me something": answer now, whatever is still unclear. */
  decideNow: z.boolean().default(false),
})
export type DiscoveryAskInput = z.infer<typeof discoveryAskSchema>
/**
 * What a client sends, as opposed to what the server ends up with.
 *
 * `answers` and `decideNow` both carry defaults, so the inferred *output* type
 * makes them required -- correct for the handler, wrong for the caller, which
 * legitimately omits both on the first turn.
 */
export type DiscoveryAskBody = z.input<typeof discoveryAskSchema>

/* ------------------------------------------------------------------ *
 * Onboarding (SPEC 21)
 * ------------------------------------------------------------------ */

/**
 * What the reader picked. Both lists may be empty.
 *
 * Capped at the size of the source lists rather than left open: these arrive
 * from a form, and a client is free to post a thousand mood keys. The moods
 * themselves are validated against `MOODS` in the service, because the
 * constant is the only thing that knows which keys exist.
 */
export const tasteSchema = z.object({
  mediaTypes: z.array(z.enum(MEDIA_TYPES)).max(MEDIA_TYPES.length).default([]),
  moodKeys: z.array(z.string().max(40)).max(32).default([]),
  skipped: z.boolean().default(false),
})

export type TasteInput = z.infer<typeof tasteSchema>

/** How many titles to offer for rating, and for which kinds. */
export const seedQuerySchema = z.object({
  mediaTypes: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((part) => part.trim())
            .filter((part): part is MediaType =>
              (MEDIA_TYPES as readonly string[]).includes(part),
            )
        : [],
    ),
  moodKeys: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((part) => part.trim()).filter(Boolean) : [])),
  limit: z.coerce.number().int().min(1).max(60).default(24),
})
