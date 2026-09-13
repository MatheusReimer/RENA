import type { Executor } from '@revy/db'
import { BADGE_DEFINITIONS, type BadgeRequirementType } from '@revy/shared/constants'
import type { BadgeProgress, EarnedBadge, MediaType } from '@revy/shared/types'
import { gamificationRepository } from '../repositories'

/**
 * Badge evaluation (SPEC 17).
 *
 * SPEC 17 requires badge requirements be implemented in a service rather than
 * hardcoded in UI components. Requirements are declarative rows, and this
 * evaluates them generically -- adding a badge is a data change plus a seed
 * run, with no code change anywhere.
 */

/** Which requirement types a given action could possibly advance. */
const TRIGGERS: Record<string, BadgeRequirementType[]> = {
  rating: ['rating_count', 'rating_count_of_type'],
  review: ['review_count'],
  discussion: ['discussion_count'],
  comment: ['comment_count'],
  friendship: ['friend_count'],
  list: ['list_count'],
}

export type BadgeTrigger = keyof typeof TRIGGERS

export const badgeService = {
  /**
   * Evaluates the badges a trigger could have unlocked and awards any earned.
   *
   * Scoped by trigger so rating a film does not re-check friend-count badges.
   * Returns only newly earned badges, so the caller knows exactly which
   * notifications to send -- re-running this is always safe and idempotent,
   * because the award insert is ON CONFLICT DO NOTHING.
   */
  async evaluate(db: Executor, userId: string, trigger: BadgeTrigger): Promise<EarnedBadge[]> {
    const requirementTypes = TRIGGERS[trigger]
    if (!requirementTypes) return []

    const candidates = await gamificationRepository.listBadgesByRequirement(db, [
      ...requirementTypes,
    ])
    if (candidates.length === 0) return []

    const alreadyEarned = await gamificationRepository.listEarnedBadgeIds(db, userId)
    const unearned = candidates.filter((badge) => !alreadyEarned.has(badge.id))
    if (unearned.length === 0) return []

    const counts = await gamificationRepository.getRequirementCounts(db, userId)

    // Only pay for the per-type breakdown when a candidate actually needs it.
    const needsTypeCounts = unearned.some(
      (badge) => badge.requirementType === 'rating_count_of_type',
    )
    const byType = needsTypeCounts
      ? await gamificationRepository.getRatingCountsByType(db, userId)
      : []
    const typeCounts = new Map<MediaType, number>(byType.map((row) => [row.mediaType, row.total]))

    const newlyEarned: EarnedBadge[] = []

    for (const badge of unearned) {
      const current = currentValue(badge, counts, typeCounts)
      if (current < badge.requirementValue) continue

      const awarded = await gamificationRepository.award(db, userId, badge.id)
      if (!awarded) continue

      newlyEarned.push({
        id: badge.id,
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        earnedAt: new Date().toISOString(),
      })
    }

    return newlyEarned
  },

  /** Every badge with the user's progress, for the profile's Badges tab. */
  async listProgress(db: Executor, userId: string): Promise<BadgeProgress[]> {
    const [all, earned, counts, byType] = await Promise.all([
      gamificationRepository.listBadges(db),
      gamificationRepository.listEarned(db, userId),
      gamificationRepository.getRequirementCounts(db, userId),
      gamificationRepository.getRatingCountsByType(db, userId),
    ])

    const earnedAtById = new Map(earned.map((row) => [row.badge.id, row.earnedAt]))
    const typeCounts = new Map<MediaType, number>(byType.map((row) => [row.mediaType, row.total]))

    return all
      .map((badge) => ({
        id: badge.id,
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        earnedAt: earnedAtById.get(badge.id)?.toISOString() ?? null,
        current: Math.min(
          currentValue(badge, counts, typeCounts),
          badge.requirementValue,
        ),
        target: badge.requirementValue,
      }))
      .sort((a, b) => {
        // Earned first (newest first), then closest-to-earning.
        if (a.earnedAt && b.earnedAt) return b.earnedAt.localeCompare(a.earnedAt)
        if (a.earnedAt) return -1
        if (b.earnedAt) return 1
        return b.current / b.target - a.current / a.target
      })
  },

  /**
   * Seeds the badge catalogue from BADGE_DEFINITIONS.
   * Idempotent -- safe to run on every deploy.
   */
  async syncCatalogue(db: Executor): Promise<void> {
    for (const definition of BADGE_DEFINITIONS) {
      await gamificationRepository.upsertBadge(db, {
        slug: definition.slug,
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        requirementType: definition.requirementType,
        requirementValue: definition.requirementValue,
        requirementMediaType: definition.requirementMediaType ?? null,
      })
    }
  },
}

/** Resolves a badge's requirement to the user's current value for it. */
function currentValue(
  badge: { requirementType: string; requirementMediaType: MediaType | null },
  counts: Record<string, number>,
  typeCounts: Map<MediaType, number>,
): number {
  if (badge.requirementType === 'rating_count_of_type') {
    return badge.requirementMediaType ? (typeCounts.get(badge.requirementMediaType) ?? 0) : 0
  }
  return counts[badge.requirementType] ?? 0
}
