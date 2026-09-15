import { exploreService } from '@revy/core'
import { errors } from '@revy/shared/utils'
import { getQuery } from 'h3'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * The titles behind one mood (SPEC 21).
 *
 * Its own endpoint because the Explore screen loads six moods as photographs
 * and fetches the titles only when somebody opens one -- seventy-two rows
 * nobody asked for is not a first impression.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useServiceContext(event)
  const key = String(getQuery(event).key ?? '')

  const mood = await exploreService.mood(ctx, key)
  // `findMood` returning null means the key is not one of ours, which is a bad
  // request rather than an empty row.
  if (!mood) throw errors.notFound('NOT_FOUND', 'No such mood.')

  return mood
})
