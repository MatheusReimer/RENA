import { MOODS } from '@revy/shared/constants'
import type { MediaType, SeedTitle, UserTaste } from '@revy/shared/types'
import { releaseYear } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { tasteRepository } from '../repositories'

/**
 * Onboarding taste (SPEC 21).
 *
 * Two things are collected and they are worth very different amounts.
 *
 * The **moods** are a stated preference, and stated preferences are weak:
 * people report the taste they would like to have, and "I'm into documentaries"
 * survives contact with a Friday evening about as well as a gym membership. So
 * they are not used to rank anything. Their job is to decide *which titles to
 * offer for rating*, which is a question they answer well.
 *
 * The **ratings** are the real payload, and they are not stored here at all --
 * they go through the ordinary rating path into `ratings`, which is what makes
 * them immediately visible to the recommender, the activity feed, the badges
 * and everything else that already reads that table. An onboarding flow that
 * wrote its scores somewhere private would be a second source of truth about
 * the same fact.
 */

/** How many moods a reader can pick before the question stops discriminating. */
const MAX_MOODS = 8

export const tasteService = {
  /** The viewer's taste, or null if they have never been asked. */
  async get(ctx: ServiceContext): Promise<UserTaste | null> {
    const auth = requireViewer(ctx)
    const row = await tasteRepository.find(auth.db, auth.viewerId)
    if (!row) return null

    return {
      mediaTypes: row.mediaTypes as MediaType[],
      moodKeys: row.moodKeys,
      skipped: row.skipped,
    }
  },

  /**
   * Records the answers.
   *
   * Mood keys are validated against `MOODS` rather than trusted, because they
   * arrive from a form and are later turned into genre names that go into a
   * query. An unknown key is dropped silently rather than rejected: the list
   * is editorial and a key removed between the page loading and the form
   * posting is our change, not the reader's mistake, and failing their signup
   * over it would be absurd.
   */
  async save(
    ctx: ServiceContext,
    input: { mediaTypes: MediaType[]; moodKeys: string[]; skipped: boolean },
  ): Promise<UserTaste> {
    const auth = requireViewer(ctx)

    const known = new Set(MOODS.map((mood) => mood.key))
    const moodKeys = [...new Set(input.moodKeys)].filter((key) => known.has(key)).slice(0, MAX_MOODS)
    const mediaTypes = [...new Set(input.mediaTypes)]

    const row = await tasteRepository.save(auth.db, auth.viewerId, {
      mediaTypes,
      moodKeys,
      skipped: input.skipped,
    })

    return {
      mediaTypes: row.mediaTypes as MediaType[],
      moodKeys: row.moodKeys,
      skipped: row.skipped,
    }
  },

  /**
   * Titles to put in front of the reader for rating.
   *
   * Takes the selection from the request rather than from storage, so the
   * screen can show a sensible grid while the reader is still choosing and
   * before anything has been saved.
   */
  async seeds(
    ctx: ServiceContext,
    options: { mediaTypes: MediaType[]; moodKeys: string[]; limit: number },
  ): Promise<SeedTitle[]> {
    const auth = requireViewer(ctx)

    const rows = await tasteRepository.seedTitles(auth.db, {
      userId: auth.viewerId,
      mediaTypes: options.mediaTypes,
      genres: genresFor(options.moodKeys),
      limit: options.limit,
    })

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      mediaType: row.mediaType,
      coverImageUrl: row.coverImageUrl,
      releaseYear: releaseYear(row.releaseDate),
    }))
  },
}

/**
 * The provider genre names behind a set of mood keys.
 *
 * Exported because the recommender needs the same translation: a mood is only
 * ever a bundle of genre strings, and the bundle has to be unpacked the same
 * way everywhere or the seed grid and the recommendations disagree about what
 * the reader asked for.
 *
 * An empty result means "no filter", not "match nothing" -- a reader who
 * picked no moods should see the whole catalogue, not an empty screen.
 */
export function genresFor(moodKeys: readonly string[]): string[] {
  if (moodKeys.length === 0) return []

  const keys = new Set(moodKeys)
  const genres = new Set<string>()
  for (const mood of MOODS) {
    if (!keys.has(mood.key)) continue
    for (const genre of mood.genres) genres.add(genre)
  }
  return [...genres]
}
