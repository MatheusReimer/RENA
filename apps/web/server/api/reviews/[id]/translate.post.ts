import { translationService } from '@revy/core'
import { RATE_LIMITS } from '@revy/shared/constants'
import { toContentLanguage } from '@revy/shared/constants'
import { errors } from '@revy/shared/utils'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'
import { assertRateLimit } from '../../../utils/rate-limit'
import { useTranslator } from '../../../utils/recommender'

/**
 * Translates one review into the reader's language (SPEC 31).
 *
 * POST rather than GET despite reading like a fetch, because the first call
 * for a given review and language creates something -- it spends money and
 * writes a cache row. A GET that does that is a GET a crawler will happily
 * make a thousand of.
 *
 * Signed-in only and rate limited for the same reason as described discovery.
 * Subsequent readers of the same review hit the cache and cost nothing, which
 * is why the limit can be generous compared to the discovery one.
 */
export default defineApiHandler(async (event) => {
  const reviewId = getRouterParam(event, 'id')
  if (!reviewId) throw errors.notFound('NOT_FOUND', 'Review not found.')

  const ctx = await useAuthenticatedContext(event)
  await assertRateLimit(event, RATE_LIMITS.translate)

  // Narrowed rather than trusted: the body is a client's claim about what it
  // wants, and an unsupported tag would otherwise be cached under a key
  // nothing can read back.
  const body = await readBody(event).catch(() => ({}))
  const target = toContentLanguage(body?.language)

  return { translation: await translationService.forReview(ctx, useTranslator(), reviewId, target) }
})
