/**
 * Badge catalogue (SPEC 17).
 *
 * Requirements are declarative so `BadgeService` can evaluate them generically;
 * SPEC 17 forbids hardcoding badge logic in UI components.
 */
import { MEDIA_TYPES } from './media'

export const BADGE_REQUIREMENT_TYPES = [
  'rating_count',
  'review_count',
  'rating_count_of_type',
  'discussion_count',
  'comment_count',
  'friend_count',
  'list_count',
] as const

export type BadgeRequirementType = (typeof BADGE_REQUIREMENT_TYPES)[number]

export interface BadgeDefinition {
  /** Stable slug. Never change this once shipped -- it is the DB key. */
  slug: string
  name: string
  description: string
  /** Emoji or icon token resolved by the UI. */
  icon: string
  /**
   * How hard this is to get, 1 (first time) to 4 (rare).
   *
   * Drives three things: the rim on the artwork, the order badges appear in
   * on a profile, and which one is shown beside somebody's name by default.
   * Not derivable from `requirementValue` -- a hundred ratings and five lists
   * are different numbers and comparable difficulty is the thing being
   * expressed.
   */
  tier: 1 | 2 | 3 | 4
  requirementType: BadgeRequirementType
  requirementValue: number
  /**
   * Narrows `rating_count_of_type` to a single media type.
   *
   * Derived from MEDIA_TYPES rather than spelled out, so adding a media type
   * makes per-type badges available for it without editing this file. An
   * earlier hardcoded union is what made adding games a compile error here.
   */
  requirementMediaType?: (typeof MEDIA_TYPES)[number]
}

/*
 * The catalogue itself (SPEC 17).
 *
 * Names describe the *person*, not the milestone -- "Avid Rater" rather than
 * "10 Ratings". A badge is worth having when it tells somebody what kind of
 * reader you have become, and the count is already shown underneath it.
 *
 * The humour is meant to be fond rather than mocking, and it only works
 * because the badge was earned: `Self-Appointed Authority` is a compliment
 * with a raised eyebrow, and would be an insult if it arrived unprompted.
 *
 * Two constraints shaped every name here:
 *
 *  - **No wordplay.** These ship in English, Portuguese and Spanish, and a pun
 *    becomes a joke in one locale and nonsense in the other two. Every name
 *    below describes a behaviour, which is what survives translation. The
 *    first version of this list opened with "Opinion Haver" -- a real
 *    construction, and one that reads as broken English to anyone outside
 *    anglophone internet culture. A bad bet on the first badge everybody earns.
 *  - **Slugs are permanent.** They are the database key and `syncCatalogue`
 *    upserts on them, so renaming a badge is a name change and adding one is a
 *    new slug. Changing a slug orphans everybody who already earned it.
 *
 * `name` and `description` are English here and treated as the fallback. The
 * client renders `badge.<slug>.name` from the locale files when it has one.
 */
export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  /* ---- Ratings ---------------------------------------------------- */
  {
    slug: 'first-rating',
    tier: 1,
    name: 'Officially Opinionated',
    description: 'Rate your first title.',
    icon: '⭐',
    requirementType: 'rating_count',
    requirementValue: 1,
  },
  {
    slug: 'ten-ratings',
    tier: 2,
    name: 'Avid Rater',
    description: 'Rate 10 titles.',
    icon: '✨',
    requirementType: 'rating_count',
    requirementValue: 10,
  },
  {
    slug: 'fifty-ratings',
    tier: 3,
    name: 'Relentless Rater',
    description: 'Rate 50 titles.',
    icon: '🔥',
    requirementType: 'rating_count',
    requirementValue: 50,
  },
  {
    slug: 'hundred-ratings',
    tier: 4,
    name: 'Self-Appointed Authority',
    description: 'Rate 100 titles.',
    icon: '🏅',
    requirementType: 'rating_count',
    requirementValue: 100,
  },

  /* ---- Reviews ---------------------------------------------------- */
  {
    slug: 'first-review',
    tier: 1,
    name: 'Has Thoughts',
    description: 'Write your first review.',
    icon: '✍️',
    requirementType: 'review_count',
    requirementValue: 1,
  },
  {
    slug: 'ten-reviews',
    tier: 2,
    name: 'Unsolicited Reviewer',
    description: 'Write 10 reviews.',
    icon: '📝',
    requirementType: 'review_count',
    requirementValue: 10,
  },
  {
    slug: 'fifty-reviews',
    tier: 3,
    name: 'Nobody Asked',
    description: 'Write 50 reviews.',
    icon: '📣',
    requirementType: 'review_count',
    requirementValue: 50,
  },

  /* ---- First of each kind ----------------------------------------- */
  {
    slug: 'first-movie',
    tier: 1,
    name: 'Casual Viewer',
    description: 'Rate your first movie.',
    icon: '🎬',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'movie',
  },
  {
    slug: 'first-series',
    tier: 1,
    name: 'Pilot Survivor',
    description: 'Rate your first series.',
    icon: '📺',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'series',
  },
  {
    slug: 'first-book',
    tier: 1,
    name: 'Reader, Allegedly',
    description: 'Rate your first book.',
    icon: '📖',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'book',
  },
  {
    slug: 'first-game',
    tier: 1,
    name: 'Pressed Start',
    description: 'Rate your first game.',
    icon: '🎮',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'game',
  },

  /* ---- Depth in each kind ------------------------------------------ *
   * Twenty-five rather than fifty, deliberately. Fifty books is a year of
   * reading for most people, and a rung nobody reaches is a rung that makes
   * the whole set feel dead. These are meant to be earned, not admired.
   * ------------------------------------------------------------------ */
  {
    slug: 'movies-25',
    tier: 3,
    name: 'Seen Everything',
    description: 'Rate 25 movies.',
    icon: '🎞️',
    requirementType: 'rating_count_of_type',
    requirementValue: 25,
    requirementMediaType: 'movie',
  },
  {
    slug: 'series-25',
    tier: 3,
    name: 'Chronically Mid-Season',
    description: 'Rate 25 series.',
    icon: '📼',
    requirementType: 'rating_count_of_type',
    requirementValue: 25,
    requirementMediaType: 'series',
  },
  {
    slug: 'books-25',
    tier: 3,
    name: 'Suspiciously Well-Read',
    description: 'Rate 25 books.',
    icon: '📚',
    requirementType: 'rating_count_of_type',
    requirementValue: 25,
    requirementMediaType: 'book',
  },
  {
    slug: 'games-25',
    tier: 3,
    name: 'Backlog in Denial',
    description: 'Rate 25 games.',
    icon: '🕹️',
    requirementType: 'rating_count_of_type',
    requirementValue: 25,
    requirementMediaType: 'game',
  },

  /* ---- Friends ----------------------------------------------------- */
  {
    slug: 'first-friend',
    tier: 1,
    name: 'Made a Friend',
    description: 'Add your first friend.',
    icon: '🤝',
    requirementType: 'friend_count',
    requirementValue: 1,
  },
  {
    slug: 'social-butterfly',
    tier: 2,
    name: 'Socially Functional',
    description: 'Make 10 friends.',
    icon: '🦋',
    requirementType: 'friend_count',
    requirementValue: 10,
  },
  {
    slug: 'fifty-friends',
    tier: 3,
    name: 'Knows Everyone',
    description: 'Make 50 friends.',
    icon: '🌐',
    requirementType: 'friend_count',
    requirementValue: 50,
  },
  {
    slug: 'hundred-friends',
    tier: 4,
    name: 'Local Celebrity',
    description: 'Make 100 friends.',
    icon: '🌟',
    requirementType: 'friend_count',
    requirementValue: 100,
  },

  /* ---- Talking ----------------------------------------------------- */
  {
    slug: 'discussion-starter',
    tier: 1,
    name: 'Started Something',
    description: 'Start your first discussion.',
    icon: '💬',
    requirementType: 'discussion_count',
    requirementValue: 1,
  },
  {
    slug: 'ten-discussions',
    tier: 2,
    name: 'Serial Instigator',
    description: 'Start 10 discussions.',
    icon: '🧨',
    requirementType: 'discussion_count',
    requirementValue: 10,
  },
  {
    slug: 'ten-comments',
    tier: 2,
    name: 'Chronic Replier',
    description: 'Leave 10 comments.',
    icon: '🗨️',
    requirementType: 'comment_count',
    requirementValue: 10,
  },
  {
    slug: 'fifty-comments',
    tier: 3,
    name: 'Last Word Enjoyer',
    description: 'Leave 50 comments.',
    icon: '🎤',
    requirementType: 'comment_count',
    requirementValue: 50,
  },

  /* ---- Lists ------------------------------------------------------- */
  {
    slug: 'first-list',
    tier: 1,
    name: 'Has a System',
    description: 'Create your first list.',
    icon: '📋',
    requirementType: 'list_count',
    requirementValue: 1,
  },
  {
    slug: 'five-lists',
    tier: 2,
    name: 'Compulsive Organiser',
    description: 'Create 5 lists.',
    icon: '🗂️',
    requirementType: 'list_count',
    requirementValue: 5,
  },
] as const
