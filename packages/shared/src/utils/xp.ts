import { XP_LEVEL_COUNT, xpRequiredForLevel } from '../constants/xp'
import type { UserXp } from '../types/domain'

/**
 * Derives level and in-level progress from a raw XP total (SPEC 16).
 *
 * Kept pure and in shared so the profile header can render a progress bar
 * without an extra round trip, and so the server and client can never
 * disagree about what level someone is.
 */
export function computeXp(totalXp: number): UserXp {
  const safeTotal = Math.max(0, Math.floor(totalXp))

  let level = 1
  while (level < XP_LEVEL_COUNT && safeTotal >= xpRequiredForLevel(level + 1)) {
    level++
  }

  const floor = xpRequiredForLevel(level)
  const ceiling = level >= XP_LEVEL_COUNT ? floor : xpRequiredForLevel(level + 1)

  return {
    totalXp: safeTotal,
    level,
    currentLevelXp: safeTotal - floor,
    // At max level there is no next level to fill; report a full bar.
    nextLevelXp: ceiling === floor ? Math.max(1, safeTotal - floor) : ceiling - floor,
  }
}

/** Progress through the current level, 0..1. Convenience for progress bars. */
export function xpProgressRatio(xp: UserXp): number {
  if (xp.nextLevelXp <= 0) return 1
  return Math.min(1, Math.max(0, xp.currentLevelXp / xp.nextLevelXp))
}
