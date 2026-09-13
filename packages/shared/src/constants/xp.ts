/**
 * XP awarded per action (SPEC 16).
 *
 * SPEC 16 is explicit that these values must live in exactly one place and
 * never be inlined at call sites. `XpService` is the only consumer.
 */
export const XP_REWARDS = {
  rate_media: 5,
  write_review: 15,
  complete_media: 5,
  create_discussion: 10,
  create_comment: 5,
  create_public_list: 10,
} as const

export type XpAction = keyof typeof XP_REWARDS

/**
 * Level thresholds (cumulative XP required to reach each level).
 *
 * Quadratic-ish curve: early levels come fast to reward a new user for
 * finishing onboarding, then stretch out. Level N requires 50 * N * (N - 1) XP.
 */
export const XP_LEVEL_COUNT = 50

export function xpRequiredForLevel(level: number): number {
  if (level <= 1) return 0
  return 50 * level * (level - 1)
}

/** Cumulative thresholds, index 0 == level 1. */
export const XP_LEVEL_THRESHOLDS: readonly number[] = Array.from(
  { length: XP_LEVEL_COUNT },
  (_, i) => xpRequiredForLevel(i + 1),
)
