import type { Executor } from '@revy/db'
import { XP_REWARDS, type XpAction } from '@revy/shared/constants'
import type { UserXp } from '@revy/shared/types'
import { computeXp } from '@revy/shared/utils'
import { userRepository } from '../repositories'

/**
 * XP awards (SPEC 16).
 *
 * The only place XP values are read. SPEC 16 requires the values live in
 * configuration and never be inlined at call sites; routing every award
 * through `award()` is what enforces that -- a caller names an action, never
 * a number.
 */
export const xpService = {
  /**
   * Awards the XP for an action.
   *
   * Takes an `Executor` rather than a full context because it is always called
   * from inside the transaction that produced the action, so XP can never be
   * granted for a write that later rolls back.
   */
  async award(db: Executor, userId: string, action: XpAction): Promise<void> {
    await userRepository.addXp(db, userId, XP_REWARDS[action])
  },

  /**
   * Removes previously awarded XP, e.g. when a review is deleted.
   * Clamped at zero by the caller's SQL so a total can never go negative.
   */
  async revoke(db: Executor, userId: string, action: XpAction): Promise<void> {
    await userRepository.addXp(db, userId, -XP_REWARDS[action])
  },

  async getForUser(db: Executor, userId: string): Promise<UserXp> {
    const total = await userRepository.getXp(db, userId)
    return computeXp(total)
  },
}
