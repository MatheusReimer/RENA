import { feedService, userService } from '@revy/core'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * A user profile (SPEC 22).
 *
 * Addressed by username rather than id so profile URLs are shareable and
 * readable: /matheusr, not /a3f0c1a5-....
 */
export default defineApiHandler(async (event) => {
  const username = getRouterParam(event, 'username') ?? ''
  const ctx = await useServiceContext(event)

  const profile = await userService.getProfileByUsername(ctx, username)

  const [activity, currently] = await Promise.all([
    feedService.getUserActivity(ctx, profile.id, 10, null),
    userService.getCurrentlyConsuming(ctx, profile.id, 5),
  ])

  return { profile, activity, currently }
})
