import { dashboardService, ratingsFingerprint } from '@revy/core'
import { MEDIA_TYPES } from '@revy/shared/constants'
import { getQuery } from 'h3'
import { cached, cacheKey } from '../../utils/cache'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * Everything the signed-in home screen shows (SPEC 18, 22, 38).
 *
 * Authenticated, and every figure in it is about the viewer -- which makes it
 * un*shareable*, not uncacheable. This route used to say the latter and skip
 * the cache entirely; the two are different questions, and conflating them
 * left the slowest endpoint in the product (measured at ~118ms, against ~15ms
 * for everything else) recomputing on every visit to the home screen.
 *
 * It is slow for a reason worth recording: `buildRecommendations` runs one
 * similarity query per anchor row, after the six it already ran together. That
 * N+1 is the real fix and this is not it -- caching hides the cost from the
 * reader and leaves it for whoever next changes the ranking. Worth doing in
 * that order anyway: the cache is a dozen lines and cannot change any answer,
 * where collapsing three ranked genre-overlap queries into one lateral join is
 * a rewrite of the thing that decides what people are shown.
 *
 * `type` filters only the trending-reviews row; the rest of the payload does
 * not change with it. Validated against the media types rather than passed
 * through, so a crafted value cannot reach the query -- and it is in the cache
 * key, because two types are two different payloads.
 */

/**
 * Shorter than the Discover rails' fifteen minutes.
 *
 * The fingerprint below covers the viewer's own ratings exactly, so the TTL
 * only exists to catch what it cannot see -- friends' activity and trending
 * reviews, which is most of this screen. A home screen that takes five minutes
 * to notice a friend finished something is fine; one that takes fifteen starts
 * to feel like a cached page.
 */
const MAX_AGE = 5 * 60

export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)
  const raw = getQuery(event).type
  const mediaType = MEDIA_TYPES.find((type) => type === raw) ?? null

  const fingerprint = await ratingsFingerprint(ctx.db, ctx.viewerId)

  return cached(
    cacheKey('dashboard', ctx.viewerId, fingerprint, ctx.locale, mediaType),
    MAX_AGE,
    () => dashboardService.get(ctx, mediaType),
  )
})
