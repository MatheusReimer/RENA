import { recommendService, tasteService } from '@revy/core'
import { discoveryAskSchema } from '@revy/shared/schemas'
import { cached, cacheKey } from '../../utils/cache'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../../utils/rate-limit'
import { useRecommender } from '../../utils/recommender'

/**
 * Answers a described request (SPEC 40, 38).
 *
 * Signed-in only, which is a departure from the rest of Discover -- Explore
 * and the rails are public because browsing before committing is the point.
 * This one is not browsing. Every call spends money on our side, and an open
 * endpoint that does that is a bill somebody else gets to write.
 */

/**
 * An hour, which is short for a cache and right for this one.
 *
 * The catalogue grows continuously -- any search that resolves a new title
 * inserts a row -- so a day-long entry would keep recommending from a
 * catalogue that has moved on. An hour covers the cases this is actually for:
 * a double-submitted form, a reader reopening the panel to re-read an answer,
 * and two people asking the same obvious question in the same session.
 */
const MAX_AGE = 60 * 60

export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, discoveryAskSchema)
  const ctx = await useAuthenticatedContext(event)

  // After the context, so the limit keys on the user rather than the IP --
  // and before the model call, so a refused request costs us nothing.
  await assertRateLimit(event, RATE_LIMITS.discovery)

  const locale = input.language ?? 'en'

  /*
   * The taste goes in the key, because it goes in the prompt.
   *
   * Two readers asking the same question get different answers once their
   * onboarding differs, so a key on the question alone would hand one reader
   * the other's personalised result. That is not a stale cache, it is the
   * wrong answer, and it is the specific hazard introduced by putting a
   * profile in the prompt at all.
   *
   * The cost is a lower hit rate: an entry is shared only by readers who asked
   * the same thing *and* answered onboarding the same way. Worth it -- this
   * path is user-triggered and already capped at sixty an hour each, so it is
   * not where the spend accumulates.
   */
  const taste = await tasteService.get(ctx).catch(() => null)
  const tasteKey =
    taste && !taste.skipped
      ? `${[...taste.mediaTypes].sort().join('+')}/${[...taste.moodKeys].sort().join('+')}`
      : 'none'

  /*
   * The transcript is part of the question.
   *
   * Turn three of a refinement is a different request from turn one even
   * though `request` is unchanged, so every answer given so far has to be in
   * the key -- otherwise narrowing a search would return the answer from
   * before it was narrowed.
   */
  const transcript = input.answers
    .map((exchange) => `${exchange.question}=${exchange.skipped ? '~' : exchange.answer}`)
    .join(';')

  const key = cacheKey(
    'ask',
    // Case and surrounding space are not part of what was asked.
    input.request.trim().toLowerCase().replace(/\s+/g, ' '),
    locale,
    transcript,
    input.decideNow ? 'now' : '',
    tasteKey,
  )

  const answer = await cached(key, MAX_AGE, () =>
    recommendService.discover(ctx, useRecommender(), input.request, locale, {
      answers: input.answers,
      decideNow: input.decideNow,
    }),
  )

  return { answer }
})
