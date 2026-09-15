import { communityService } from '@revy/core'
import { PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import { z } from 'zod'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../../utils/handler'

/**
 * Communities (SPEC 14).
 *
 * Four views of the same thing, because a community is not a record:
 *
 *  - `browse` -- the whole catalogue, most-joined first. Every title is a
 *    community from the moment it exists, so this is what "they are all there
 *    already, you just join" actually looks like.
 *  - `active` -- where something is happening, by threads *or* joins.
 *  - `friends` -- where the people you know already are.
 *  - `joined` -- yours.
 *
 * `friends` and `joined` need a session; the other two are public, because a
 * community is only worth joining if you can see it first.
 */
export default defineApiHandler(async (event) => {
  const { scope, page, q } = readValidatedQueryOrThrow(
    event,
    z.object({
      scope: z.enum(['browse', 'active', 'friends', 'joined']).default('browse'),
      /*
       * The typed filter, matched against every name a title has -- including
       * its release titles in other languages.
       *
       * Trimmed to nothing means "no filter" rather than "match the empty
       * string", so a field the reader cleared behaves like one they never
       * touched. Length-capped because it goes into a LIKE pattern, and an
       * unbounded one is a cheap way to make the database work hard.
       */
      q: z
        .string()
        .trim()
        .max(80)
        .optional()
        .transform((value) => (value ? value : undefined)),
      /*
       * Paging for `browse` alone; the other three are a single ranked page.
       *
       * Capped, so a crafted `page=100000000` cannot ask Postgres to count
       * past a hundred million rows before returning nothing.
       */
      page: z.coerce.number().int().min(0).max(500).default(0),
    }),
  )
  const ctx = await useServiceContext(event)

  if (scope === 'joined') {
    return { communities: await communityService.listJoined(ctx, PAGE_SIZE_DEFAULT, q) }
  }
  if (scope === 'friends') {
    return { communities: await communityService.listFriends(ctx, PAGE_SIZE_DEFAULT, q) }
  }
  if (scope === 'active') {
    return { communities: await communityService.listActive(ctx, PAGE_SIZE_DEFAULT, q) }
  }
  return {
    communities: await communityService.listBrowse(
      ctx,
      PAGE_SIZE_DEFAULT,
      page * PAGE_SIZE_DEFAULT,
      q,
    ),
  }
})
