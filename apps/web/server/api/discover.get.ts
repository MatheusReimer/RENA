import { discoverService, ratingsFingerprint } from '@revy/core'
import { mediaTypeSchema } from '@revy/shared/schemas'
import { z } from 'zod'
import { cached, cacheKey } from '../utils/cache'
import { useServiceContext } from '../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../utils/handler'

/**
 * Discover sections (SPEC 21, 38).
 *
 * Open to signed-out callers -- trending and popular are public. Friend
 * sections are simply absent without a session, because the service omits
 * empty sections rather than returning bare headings.
 *
 * Cached, and this is the one route in the product where that earns its
 * keep: measured at ~170ms signed in against ~22ms signed out, the difference
 * being two collaborative-filtering queries that walk a hundred-title taste
 * profile against a two-hundred-reader neighbourhood. That work was being
 * redone on every page load, for an answer that had not changed.
 */

/**
 * A signed-in reader's own rails.
 *
 * Short, because the ceiling is not what keeps this correct -- the fingerprint
 * in the key is. Their own ratings invalidate it exactly, and the ceiling only
 * covers what the fingerprint cannot see: a *friend* rating something, which
 * moves these rails without touching anything of theirs.
 */
const VIEWER_MAX_AGE = 15 * 60

/**
 * The signed-out rails, shared by everybody.
 *
 * The highest-hit-rate cache available here -- every anonymous visitor gets a
 * byte-identical answer -- and the shortest TTL, because it is also the page
 * most likely to be someone's first impression, and "trending" that is an hour
 * old is not trending.
 */
const PUBLIC_MAX_AGE = 5 * 60

export default defineApiHandler(async (event) => {
  const { type } = readValidatedQueryOrThrow(
    event,
    z.object({ type: mediaTypeSchema.optional() }),
  )
  const ctx = await useServiceContext(event)

  const build = async () => ({
    sections: type
      ? await discoverService.getForType(ctx, type)
      : await discoverService.getSections(ctx),
  })

  /*
   * The locale is in every key.
   *
   * Sections carry titles resolved in the reader's language, so a cache keyed
   * without it would serve a Portuguese reader English headings -- the kind of
   * bug that only shows up once two locales share an instance, which is to say
   * in production and not in development.
   */
  if (!ctx.viewerId) {
    return cached(cacheKey('discover', 'anon', ctx.locale, type), PUBLIC_MAX_AGE, build)
  }

  /*
   * Keyed on what the reader has rated, not on a clock.
   *
   * This is what makes "when do we recompute" answerable: rating twenty titles
   * during onboarding changes the fingerprint twenty times and costs twenty
   * index seeks, but only produces one recomputation -- the next time they
   * actually open this page. Somebody who rates nothing and reloads ten times
   * computes once. Nothing is recomputed for a reader who is not looking.
   */
  const fingerprint = await ratingsFingerprint(ctx.db, ctx.viewerId)

  return cached(
    cacheKey('discover', ctx.viewerId, fingerprint, ctx.locale, type),
    VIEWER_MAX_AGE,
    build,
  )
})
