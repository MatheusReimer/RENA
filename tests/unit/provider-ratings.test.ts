import { createOpenLibraryProvider, createTmdbProvider } from '@revy/core'
import { describe, expect, it } from 'vitest'

/**
 * Provider score normalisation.
 *
 * Every screen draws `externalRating.score` out of ten without asking which
 * provider it came from, which is the whole point of normalising at capture --
 * and also the reason a mistake here is invisible. Open Library rates out of
 * five: forget to double it and every book in the catalogue quietly reads as
 * half as good as it is, with nothing anywhere to say so.
 */

function stub(handler: (url: string) => { status?: number; body: unknown }) {
  const impl = (async (input: string | URL) => {
    const { status = 200, body } = handler(String(input))
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response
  }) as unknown as typeof fetch

  return impl
}

describe('open library ratings', () => {
  it('doubles the five-point average onto the shared ten-point scale', async () => {
    const provider = createOpenLibraryProvider({
      fetchImpl: stub(() => ({ body: { summary: { average: 4.4491525, count: 118 } } })),
    })

    expect(await provider.getRating!('OL27448W', 'book')).toEqual({
      source: 'Open Library',
      score: 8.9,
      votes: 118,
    })
  })

  it('asks the work ratings endpoint', async () => {
    let seen = ''
    const provider = createOpenLibraryProvider({
      fetchImpl: stub((url) => {
        seen = url
        return { body: { summary: { average: 3, count: 2 } } }
      }),
    })

    await provider.getRating!('OL45804W', 'book')

    expect(seen).toContain('/works/OL45804W/ratings.json')
  })

  /*
   * A work nobody has rated 404s rather than returning an empty summary.
   * Treating that as a failure would abort a backfill on its first obscure
   * book; it is an answer, and the answer is "none".
   */
  it('reads a 404 as no rating rather than as an error', async () => {
    const provider = createOpenLibraryProvider({
      fetchImpl: stub(() => ({ status: 404, body: {} })),
    })

    expect(await provider.getRating!('OL1W', 'book')).toBeNull()
  })

  it('still throws on a real provider failure', async () => {
    const provider = createOpenLibraryProvider({
      fetchImpl: stub(() => ({ status: 500, body: {} })),
    })

    await expect(provider.getRating!('OL1W', 'book')).rejects.toThrow()
  })

  it('returns null for an empty or zero summary', async () => {
    for (const summary of [{}, { average: 0, count: 0 }, { average: 4.2, count: 0 }, {}]) {
      const provider = createOpenLibraryProvider({
        fetchImpl: stub(() => ({ body: { summary } })),
      })
      expect(await provider.getRating!('OL1W', 'book')).toBeNull()
    }
  })
})

describe('tmdb ratings', () => {
  it('keeps the ten-point scale and rounds to one decimal', async () => {
    const provider = createTmdbProvider({
      apiKey: 'a'.repeat(32),
      fetchImpl: stub(() => ({ body: { id: 1, vote_average: 7.643, vote_count: 4309 } })),
    })

    expect(await provider.getRating!('83533', 'movie')).toEqual({
      source: 'TMDB',
      score: 7.6,
      votes: 4309,
    })
  })

  /*
   * The bug this whole refresh exists for. A title imported before release
   * has `vote_average: 0`, which must read as "no score" rather than as a
   * score of zero -- otherwise every upcoming film shows a hard 0.0/10.
   */
  it('reads a zero average as no rating, not as a score of zero', async () => {
    const provider = createTmdbProvider({
      apiKey: 'a'.repeat(32),
      fetchImpl: stub(() => ({ body: { id: 1, vote_average: 0, vote_count: 0 } })),
    })

    expect(await provider.getRating!('1234', 'movie')).toBeNull()
  })

  it('asks the tv endpoint for a series', async () => {
    let seen = ''
    const provider = createTmdbProvider({
      apiKey: 'a'.repeat(32),
      fetchImpl: stub((url) => {
        seen = url
        return { body: { id: 1, vote_average: 8.4, vote_count: 11230 } }
      }),
    })

    await provider.getRating!('82856', 'series')

    expect(seen).toContain('/tv/82856')
  })

  it('returns nothing for a type TMDB does not serve', async () => {
    const provider = createTmdbProvider({
      apiKey: 'a'.repeat(32),
      fetchImpl: stub(() => ({ body: { id: 1, vote_average: 9, vote_count: 10 } })),
    })

    expect(await provider.getRating!('OL1W', 'book')).toBeNull()
  })
})
