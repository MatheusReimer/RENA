import { exploreService } from '@revy/core'
import { MEDIA_TYPES } from '@revy/shared/constants'
import { getQuery } from 'h3'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * The Explore screen's standing rows (SPEC 21).
 *
 * Public, like Discover: browsing is the one thing a visitor should be able to
 * do before signing up.
 *
 * `type` is validated against the media types rather than passed through, so a
 * crafted value can never reach a query.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useServiceContext(event)
  const raw = getQuery(event).type
  const mediaType = MEDIA_TYPES.find((type) => type === raw) ?? null

  return exploreService.summary(ctx, mediaType)
})
