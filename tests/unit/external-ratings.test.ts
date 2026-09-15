import { createIgdbProvider, createRawgProvider, createTmdbProvider } from '@revy/core'
import { describe, expect, it } from 'vitest'

/**
 * Provider scores, as they reach the domain (SPEC 8).
 *
 * Three providers publish an aggregate and all three publish it on a different
 * scale: TMDB out of 10, IGDB out of 100, RAWG out of 5 with Metacritic's out
 * of 100 alongside it. The domain stores one scale and an attribution, so
 * every one of these is a conversion -- and a conversion that is silently
 * wrong shows a game rated 9.4 as a 94, or a film rated 7.5 as a 0.75, on a
 * page whose whole job is to be trusted about numbers.
 *
 * The other thing under test is restraint: a headline score computed from
 * three votes is noise wearing the costume of a consensus, and should not be
 * captured at all.
 */

function jsonStub(payload: unknown, capture?: (url: string) => void) {
  return (async (input: string | URL) => {
    capture?.(String(input))
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as unknown as Response
  }) as unknown as typeof fetch
}

/* ------------------------------------------------------------------ *
 * TMDB
 * ------------------------------------------------------------------ */

describe('TMDB external rating', () => {
  function tmdb(movie: Record<string, unknown>) {
    return createTmdbProvider({
      apiKey: 'k',
      fetchImpl: jsonStub({ id: 1, title: 'Dune', genres: [], ...movie }),
    })
  }

  it('carries the score through on the scale TMDB already uses', async () => {
    const media = await tmdb({ vote_average: 7.84, vote_count: 12045 }).getByExternalId(
      '1',
      'movie',
    )

    expect(media?.metadata.externalRating).toEqual({
      source: 'TMDB',
      score: 7.8,
      votes: 12045,
    })
  })

  it('attributes the score to TMDB, not to IMDb', async () => {
    // These get conflated constantly. IMDb's ratings are licensed and not
    // redistributable; this number is TMDB's own and must say so.
    const media = await tmdb({ vote_average: 7, vote_count: 10 }).getByExternalId('1', 'movie')

    expect(media?.metadata.externalRating?.source).toBe('TMDB')
  })

  it('omits the rating entirely when TMDB has no score', async () => {
    // Zero is TMDB's "nobody has voted", not a verdict of nought out of ten.
    const media = await tmdb({ vote_average: 0, vote_count: 0 }).getByExternalId('1', 'movie')

    expect(media?.metadata.externalRating).toBeUndefined()
  })

  it('survives a response with no rating fields at all', async () => {
    const media = await tmdb({}).getByExternalId('1', 'movie')

    expect(media?.metadata.externalRating).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ *
 * IGDB
 * ------------------------------------------------------------------ */

describe('IGDB external rating', () => {
  function igdb(game: Record<string, unknown>) {
    let tokenIssued = false
    const impl = (async (input: string | URL) => {
      const url = String(input)
      if (url.includes('id.twitch.tv')) {
        tokenIssued = true
        return {
          ok: true,
          status: 200,
          json: async () => ({ access_token: 't', expires_in: 5_000_000 }),
        } as unknown as Response
      }

      expect(tokenIssued).toBe(true)
      return {
        ok: true,
        status: 200,
        json: async () => [{ id: 1, name: 'Elden Ring', ...game }],
      } as unknown as Response
    }) as unknown as typeof fetch

    return createIgdbProvider({ clientId: 'c', clientSecret: 's', fetchImpl: impl })
  }

  it('rescales a 0-100 score to the 0-10 the domain stores', async () => {
    const media = await igdb({ total_rating: 94, total_rating_count: 2100 }).getByExternalId(
      '1',
      'game',
    )

    expect(media?.metadata.externalRating).toEqual({
      source: 'IGDB',
      score: 9.4,
      votes: 2100,
    })
  })

  it('ignores a score too few people voted on', async () => {
    // A 94 from three votes is not a consensus, and printing it beside a
    // community average built from hundreds would be the more misleading of
    // the two numbers.
    const media = await igdb({ total_rating: 94, total_rating_count: 3 }).getByExternalId(
      '1',
      'game',
    )

    expect(media?.metadata.externalRating).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ *
 * RAWG
 * ------------------------------------------------------------------ */

describe('RAWG external rating', () => {
  function rawg(game: Record<string, unknown>) {
    return createRawgProvider({
      apiKey: 'k',
      fetchImpl: jsonStub({ id: 1, name: 'Hades', genres: [], ...game }),
    })
  }

  it('prefers Metacritic, and attributes it to Metacritic rather than RAWG', async () => {
    // RAWG is the pipe, not the source.
    const media = await rawg({
      metacritic: 93,
      rating: 4.4,
      ratings_count: 900,
    }).getByExternalId('1', 'game')

    expect(media?.metadata.externalRating).toEqual({
      source: 'Metacritic',
      score: 9.3,
      votes: 0,
    })
  })

  it('falls back to the player score, doubled onto the 0-10 scale', async () => {
    const media = await rawg({ rating: 4.4, ratings_count: 900 }).getByExternalId('1', 'game')

    expect(media?.metadata.externalRating).toEqual({
      source: 'RAWG',
      score: 8.8,
      votes: 900,
    })
  })

  it('ignores a player score too few people voted on', async () => {
    const media = await rawg({ rating: 5, ratings_count: 2 }).getByExternalId('1', 'game')

    expect(media?.metadata.externalRating).toBeUndefined()
  })

  it('treats a null Metacritic as absent rather than as zero', async () => {
    // RAWG sends `metacritic: null` for the majority of its catalogue.
    const media = await rawg({ metacritic: null, rating: 3.5, ratings_count: 40 })
      .getByExternalId('1', 'game')

    expect(media?.metadata.externalRating?.source).toBe('RAWG')
    expect(media?.metadata.externalRating?.score).toBe(7)
  })
})
