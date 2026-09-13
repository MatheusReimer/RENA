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

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  {
    slug: 'first-rating',
    name: 'First Rating',
    description: 'Rate your first title.',
    icon: '\u2b50',
    requirementType: 'rating_count',
    requirementValue: 1,
  },
  {
    slug: 'first-review',
    name: 'First Review',
    description: 'Write your first review.',
    icon: '\u270d\ufe0f',
    requirementType: 'review_count',
    requirementValue: 1,
  },
  {
    slug: 'ten-ratings',
    name: '10 Ratings',
    description: 'Rate 10 titles.',
    icon: '\ud83c\udfaf',
    requirementType: 'rating_count',
    requirementValue: 10,
  },
  {
    slug: 'fifty-ratings',
    name: '50 Ratings',
    description: 'Rate 50 titles.',
    icon: '\ud83c\udfc5',
    requirementType: 'rating_count',
    requirementValue: 50,
  },
  {
    slug: 'hundred-ratings',
    name: '100 Ratings',
    description: 'Rate 100 titles.',
    icon: '\ud83d\udc51',
    requirementType: 'rating_count',
    requirementValue: 100,
  },
  {
    slug: 'first-movie',
    name: 'First Movie',
    description: 'Rate your first movie.',
    icon: '\ud83c\udfac',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'movie',
  },
  {
    slug: 'first-series',
    name: 'First Series',
    description: 'Rate your first series.',
    icon: '\ud83d\udcfa',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'series',
  },
  {
    slug: 'first-book',
    name: 'First Book',
    description: 'Rate your first book.',
    icon: '\ud83d\udcd6',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'book',
  },
  {
    slug: 'first-game',
    name: 'First Game',
    description: 'Rate your first game.',
    icon: '🎮',
    requirementType: 'rating_count_of_type',
    requirementValue: 1,
    requirementMediaType: 'game',
  },
  {
    slug: 'discussion-starter',
    name: 'Discussion Starter',
    description: 'Start your first discussion.',
    icon: '\ud83d\udcac',
    requirementType: 'discussion_count',
    requirementValue: 1,
  },
  {
    slug: 'social-butterfly',
    name: 'Social Butterfly',
    description: 'Make 10 friends.',
    icon: '\ud83e\udd8b',
    requirementType: 'friend_count',
    requirementValue: 10,
  },
] as const
