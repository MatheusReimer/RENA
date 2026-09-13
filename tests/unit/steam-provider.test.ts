import { createSteamProvider, parseSteamDate } from '@revy/core'
import { describe, expect, it } from 'vitest'

/**
 * Steam provider behaviour (SPEC 8, 43).
 *
 * Steam is the keyless fallback for games, so it is the provider most likely
 * to be in use. Uses the injected `fetchImpl` rather than a network.
 */

describe('parseSteamDate', () => {
  it('parses the usual full date', () => {
    expect(parseSteamDate('17 Sep, 2020')).toBe('2020-09-17')
    expect(parseSteamDate('26 Feb, 2016')).toBe('2016-02-26')
  })

  it('handles a month and year with no day', () => {
    expect(parseSteamDate('Sep 2020')).toBe('2020-09-01')
  })

  it('handles a bare year', () => {
    expect(parseSteamDate('2020')).toBe('2020-01-01')
  })

  it('returns null for unreleased and unknown dates', () => {
    // Postgres needs an ISO date or null, and a half-parsed date is worse than
    // none -- it would show a wrong year on the media page forever.
    expect(parseSteamDate('Coming soon')).toBeNull()
    expect(parseSteamDate('To be announced')).toBeNull()
    expect(parseSteamDate('')).toBeNull()
    expect(parseSteamDate(undefined)).toBeNull()
  })

  it('rejects a day that is not a real day', () => {
    expect(parseSteamDate('99 Sep, 2020')).toBe('2020-09-01')
  })

  it('always returns a value Postgres will accept', () => {
    const samples = ['17 Sep, 2020', 'Sep 2020', '2020', 'Q4 2021', 'Coming soon', '']
    for (const sample of samples) {
      const result = parseSteamDate(sample)
      if (result !== null) expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })
})

function stubFetch(search: unknown[], details?: Record<string, unknown>) {
  const impl = (async (input: string | URL) => {
    const url = String(input)
    const body = url.includes('/storesearch') ? { items: search } : (details ?? {})
    return { ok: true, status: 200, json: async () => body } as Response
  }) as unknown as typeof fetch
  return impl
}

describe('search', () => {
  it('filters out soundtracks and demos', async () => {
    // Steam's search returns these alongside the game, and its own
    // `category1=998` games filter is ignored on this endpoint (verified).
    const impl = stubFetch([
      { id: 1145360, name: 'Hades', tiny_image: 'a.jpg' },
      { id: 1206340, name: 'Hades Original Soundtrack', tiny_image: 'b.jpg' },
      { id: 999, name: 'Hades Demo', tiny_image: 'c.jpg' },
      { id: 1145350, name: 'Hades II', tiny_image: 'd.jpg' },
    ])

    const results = await createSteamProvider({ fetchImpl: impl }).search({
      query: 'hades',
      limit: 10,
    })

    expect(results.map((r) => r.title)).toEqual(['Hades', 'Hades II'])
  })

  it('returns nothing for a non-game media type', async () => {
    const results = await createSteamProvider({ fetchImpl: stubFetch([]) }).search({
      query: 'x',
      limit: 5,
      mediaType: 'movie',
    })
    expect(results).toEqual([])
  })

  it('respects the limit', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: i, name: `Game ${i}` }))
    const results = await createSteamProvider({ fetchImpl: stubFetch(many) }).search({
      query: 'x',
      limit: 3,
    })
    expect(results).toHaveLength(3)
  })

  it('leaves the release date null rather than guessing', async () => {
    const results = await createSteamProvider({
      fetchImpl: stubFetch([{ id: 1, name: 'Game' }]),
    }).search({ query: 'x', limit: 1 })
    expect(results[0]!.releaseDate).toBeNull()
  })
})

describe('getByExternalId', () => {
  const details = (data: Record<string, unknown>) => ({ '413150': { success: true, data } })

  it('maps a game to the domain shape', async () => {
    const impl = stubFetch(
      [],
      details({
        type: 'game',
        name: 'Stardew Valley',
        short_description: 'Inherit a farm.',
        header_image: 'header.jpg',
        release_date: { date: '26 Feb, 2016' },
        genres: [{ description: 'Indie' }, { description: 'RPG' }],
        developers: ['ConcernedApe'],
        platforms: { windows: true, mac: true, linux: false },
      }),
    )

    const result = await createSteamProvider({ fetchImpl: impl }).getByExternalId(
      '413150',
      'game',
    )

    expect(result!.title).toBe('Stardew Valley')
    expect(result!.releaseDate).toBe('2016-02-26')
    expect(result!.metadata.genres).toEqual(['Indie', 'RPG'])
    expect(result!.metadata.developers).toEqual(['ConcernedApe'])
    // Only supported platforms, renamed to how a person would say them.
    expect(result!.metadata.platforms).toEqual(['PC', 'macOS'])
  })

  it('refuses anything that is not a game', async () => {
    // The real guard: search may surface a soundtrack, but nothing except an
    // actual game is allowed to become a media row.
    for (const type of ['dlc', 'music', 'video', 'demo']) {
      const impl = stubFetch([], details({ type, name: 'Something' }))
      const result = await createSteamProvider({ fetchImpl: impl }).getByExternalId(
        '413150',
        'game',
      )
      expect(result, `type "${type}" should be rejected`).toBeNull()
    }
  })

  it('returns null when Steam reports no such app', async () => {
    const impl = stubFetch([], { '413150': { success: false } })
    const result = await createSteamProvider({ fetchImpl: impl }).getByExternalId(
      '413150',
      'game',
    )
    expect(result).toBeNull()
  })

  it('returns null for a non-game media type', async () => {
    const result = await createSteamProvider({ fetchImpl: stubFetch([]) }).getByExternalId(
      '413150',
      'book',
    )
    expect(result).toBeNull()
  })
})
