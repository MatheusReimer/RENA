import { createTmdbProvider } from '@revy/core'
import { describe, expect, it } from 'vitest'

/**
 * TMDB provider behaviour (SPEC 8, 43).
 *
 * Uses the injected `fetchImpl` rather than a network, so these are real unit
 * tests of the provider's own logic: which endpoint it calls, how it
 * authenticates, and how it divides a limit between media types.
 */

function movie(id: number, title: string) {
  return { id, title, release_date: '2020-01-01', poster_path: `/p${id}.jpg` }
}

function series(id: number, name: string) {
  return { id, name, first_air_date: '2020-01-01', poster_path: `/p${id}.jpg` }
}

/** Records every request, and answers with 20 results per endpoint. */
function stubFetch(overrides: { movies?: unknown[]; series?: unknown[] } = {}) {
  const calls: Array<{ url: string; authorization?: string }> = []

  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, ...(headers.authorization ? { authorization: headers.authorization } : {}) })

    const results = url.includes('/search/tv')
      ? (overrides.series ?? Array.from({ length: 20 }, (_, i) => series(100 + i, `Series ${i}`)))
      : (overrides.movies ?? Array.from({ length: 20 }, (_, i) => movie(i, `Movie ${i}`)))

    return {
      ok: true,
      status: 200,
      json: async () => ({ results }),
    } as Response
  }) as unknown as typeof fetch

  return { impl, calls }
}

describe('authentication', () => {
  it('sends a v4 read access token as a Bearer header', async () => {
    // TMDB's settings page offers both credentials and does not explain the
    // difference; a JWT sent as ?api_key= returns 401.
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.signature'
    const { impl, calls } = stubFetch()

    await createTmdbProvider({ apiKey: jwt, fetchImpl: impl }).search({
      query: 'matrix',
      limit: 5,
      mediaType: 'movie',
    })

    expect(calls[0]!.authorization).toBe(`Bearer ${jwt}`)
    expect(calls[0]!.url).not.toContain('api_key')
  })

  it('sends a v3 api key as a query parameter', async () => {
    const key = 'a'.repeat(32)
    const { impl, calls } = stubFetch()

    await createTmdbProvider({ apiKey: key, fetchImpl: impl }).search({
      query: 'matrix',
      limit: 5,
      mediaType: 'movie',
    })

    expect(calls[0]!.url).toContain(`api_key=${key}`)
    expect(calls[0]!.authorization).toBeUndefined()
  })
})

describe('media type filtering', () => {
  const provider = () =>
    createTmdbProvider({ apiKey: 'k'.repeat(32), fetchImpl: stubFetch().impl })

  it('queries only the TV endpoint when asked for series', async () => {
    const { impl, calls } = stubFetch()
    await createTmdbProvider({ apiKey: 'k', fetchImpl: impl }).search({
      query: 'breaking bad',
      limit: 5,
      mediaType: 'series',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/search/tv')
  })

  it('queries only the movie endpoint when asked for movies', async () => {
    const { impl, calls } = stubFetch()
    await createTmdbProvider({ apiKey: 'k', fetchImpl: impl }).search({
      query: 'matrix',
      limit: 5,
      mediaType: 'movie',
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('/search/movie')
  })

  it('returns only series when series were requested', async () => {
    // The regression: both endpoints were queried, concatenated movies-first,
    // then sliced to the limit -- so a series search returned only movies,
    // which the caller then filtered away to nothing.
    const results = await provider().search({
      query: 'anything',
      limit: 5,
      mediaType: 'series',
    })

    expect(results).toHaveLength(5)
    expect(results.every((r) => r.mediaType === 'series')).toBe(true)
  })

  it('never returns zero results for a type the catalogue has', async () => {
    const results = await provider().search({ query: 'x', limit: 1, mediaType: 'series' })
    expect(results).toHaveLength(1)
    expect(results[0]!.mediaType).toBe('series')
  })
})

describe('unfiltered search', () => {
  it('interleaves types rather than letting one fill the page', async () => {
    const results = await createTmdbProvider({
      apiKey: 'k',
      fetchImpl: stubFetch().impl,
    }).search({ query: 'dune', limit: 6 })

    expect(results).toHaveLength(6)
    expect(results.filter((r) => r.mediaType === 'movie')).toHaveLength(3)
    expect(results.filter((r) => r.mediaType === 'series')).toHaveLength(3)
  })

  it('still fills the limit when one type has nothing', async () => {
    const { impl } = stubFetch({ series: [] })
    const results = await createTmdbProvider({ apiKey: 'k', fetchImpl: impl }).search({
      query: 'dune',
      limit: 5,
    })

    expect(results).toHaveLength(5)
    expect(results.every((r) => r.mediaType === 'movie')).toBe(true)
  })

  it('returns what exists when both types are short', async () => {
    const { impl } = stubFetch({ movies: [movie(1, 'Only')], series: [] })
    const results = await createTmdbProvider({ apiKey: 'k', fetchImpl: impl }).search({
      query: 'obscure',
      limit: 20,
    })

    expect(results).toHaveLength(1)
  })
})

describe('field mapping', () => {
  it('reads name/first_air_date for series and title/release_date for movies', async () => {
    const { impl } = stubFetch()
    const p = createTmdbProvider({ apiKey: 'k', fetchImpl: impl })

    const [tv] = await p.search({ query: 'x', limit: 1, mediaType: 'series' })
    const [film] = await p.search({ query: 'x', limit: 1, mediaType: 'movie' })

    expect(tv!.title).toBe('Series 0')
    expect(film!.title).toBe('Movie 0')
    expect(tv!.releaseDate).toBe('2020-01-01')
  })

  it('normalises an empty release date to null', async () => {
    // TMDB returns '' for unknown dates, which Postgres rejects as a date.
    const { impl } = stubFetch({ movies: [{ id: 9, title: 'Untitled', release_date: '' }] })
    const [result] = await createTmdbProvider({ apiKey: 'k', fetchImpl: impl }).search({
      query: 'x',
      limit: 1,
      mediaType: 'movie',
    })

    expect(result!.releaseDate).toBeNull()
  })
})
