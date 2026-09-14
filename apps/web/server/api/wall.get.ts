import { discoverService } from '@revy/core'
import { useServiceContext } from '../utils/context'
import { defineApiHandler } from '../utils/handler'

/**
 * Artwork for the home wall.
 *
 * Its own route rather than part of the feed: the wall is the first thing
 * painted and must not wait on a feed query, and it is identical for every
 * viewer, signed in or not.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useServiceContext(event)
  return discoverService.wall(ctx)
})
