import { createProviderRegistry, createRawgProvider } from '@revy/core'
import { MEDIA_TYPES } from '@revy/shared/constants'
import { describe, expect, it } from 'vitest'

/**
 * RAWG, and the contract the catalogue import depends on (SPEC 8).
 *
 * The test that matters most here is not about RAWG's response shape. It is
 * that every provider the registry can hand back is able to bulk list at all.
 *
 * The importer skips a provider without `listPopular`, and the registry
 * prefers a *configured* provider over the keyless fallback. Together those
 * two reasonable rules produced an unreasonable outcome: setting RAWG_API_KEY
 * -- the thing you do to get better games -- replaced Steam's hundred titles
 * with nothing, and said so in the same tone as a success. The last block
 * here is what stops that returning.
 */

function stub(payload: unknown, capture?: (url: string) => void) {
  return (async (input: string | URL) => {
    capture?.(String(input))
    return { ok: true, status: 200, json: async () => payload } as unknown as Response
  }) as unknown as typeof fetch
}

/** One row shaped like RAWG's list endpoint, which omits some detail fields. */
const LISTED_GAME = {
  id: 3498,
  name: 'Grand Theft Auto V',
  released: '2013-09-17',
  background_image: 'https://media.rawg.io/gta5.jpg',
  genres: [{ name: 'Action' }, { name: 'Adventure' }],
  platforms: [{ platform: { name: 'PC' } }, { platform: { name: 'PlayStation 5' } }],
  playtime: 74,
  metacritic: 92,
  rating: 4.47,
  ratings_count: 6900,
}

describe('bulk listing the catalogue', () => {
  // The first request is the list; the ones after it are the per-title
  // synopsis lookups, so this asserts on the first rather than the last.
  it('asks for the most widely held games, page by page', async () => {
    const seen: string[] = []
    const provider = createRawgProvider({
      apiKey: 'k',
      fetchImpl: stub({ results: [LISTED_GAME] }, (url) => {
        seen.push(url)
      }),
    })

    await provider.listPopular!('game', 3)

    const url = new URL(seen[0]!)
    expect(url.pathname).toBe('/api/games')
    expect(url.searchParams.get('ordering')).toBe('-added')
    expect(url.searchParams.get('page')).toBe('3')
    expect(url.searchParams.get('key')).toBe('k')
  })

  /*
   * RAWG rejects a page_size above 40 outright, which would fail the import
   * on its first request rather than degrade.
   */
  it('never asks for more rows than RAWG allows', async () => {
    let seen = ''
    const provider = createRawgProvider({
      apiKey: 'k',
      fetchImpl: stub({ results: [] }, (url) => {
        seen = url
      }),
    })

    await provider.listPopular!('game', 1)

    expect(Number(new URL(seen).searchParams.get('page_size'))).toBeLessThanOrEqual(40)
  })

  it('returns nothing for a type it does not serve', async () => {
    const provider = createRawgProvider({ apiKey: 'k', fetchImpl: stub({ results: [] }) })
    expect(await provider.listPopular!('movie', 1)).toEqual([])
  })

  it('fills in the metadata that a bare game row is missing', async () => {
    const provider = createRawgProvider({
      apiKey: 'k',
      fetchImpl: stub({ results: [LISTED_GAME] }),
    })

    const [game] = await provider.listPopular!('game', 1)

    expect(game?.title).toBe('Grand Theft Auto V')
    expect(game?.externalId).toBe('3498')
    expect(game?.releaseDate).toBe('2013-09-17')
    expect(game?.metadata.genres).toEqual(['Action', 'Adventure'])
    expect(game?.metadata.platforms).toEqual(['PC', 'PlayStation 5'])
    // RAWG reports playtime in hours; the domain stores minutes.
    expect(game?.metadata.runtimeMinutes).toBe(74 * 60)
  })

  it('attributes the score to Metacritic rather than to RAWG', async () => {
    const provider = createRawgProvider({
      apiKey: 'k',
      fetchImpl: stub({ results: [LISTED_GAME] }),
    })

    const [game] = await provider.listPopular!('game', 1)

    expect(game?.metadata.externalRating).toEqual({
      source: 'Metacritic',
      score: 9.2,
      votes: 0,
    })
  })

  /*
   * The list and detail endpoints must agree.
   *
   * The catalogue is built by one and refreshed by the other, so a field
   * handled in only one place gives a title metadata that depends on how it
   * was discovered -- which is invisible until somebody notices half the
   * games have no genres.
   */
  it('maps a listed game the same way it maps a fetched one', async () => {
    const detail = { ...LISTED_GAME, description_raw: 'A story about crime.' }

    const listed = await createRawgProvider({
      apiKey: 'k',
      fetchImpl: stub({ results: [LISTED_GAME] }),
    }).listPopular!('game', 1)

    const fetched = await createRawgProvider({
      apiKey: 'k',
      fetchImpl: stub(detail),
    }).getByExternalId('3498', 'game')

    expect(listed[0]?.metadata).toEqual(fetched?.metadata)
    expect(listed[0]?.coverImageUrl).toBe(fetched?.coverImageUrl)

    // The one documented difference: the list endpoint carries no description.
    expect(listed[0]?.description).toBeNull()
    expect(fetched?.description).toBe('A story about crime.')
  })

  /*
   * The list endpoint carries no synopsis, so the bulk list fetches one per
   * title. Without it, switching to RAWG would empty the description on every
   * game's page -- a visible downgrade from IGDB, whose list includes a
   * summary.
   */
  it('fills in the synopsis the list endpoint omits', async () => {
    const seen: string[] = []
    const provider = createRawgProvider({
      apiKey: 'k',
      fetchImpl: (async (input: string | URL) => {
        const url = String(input)
        seen.push(url)
        const body = /\/games\/\d+\?/.test(url)
          ? { ...LISTED_GAME, description_raw: 'A story about crime.' }
          : { results: [LISTED_GAME] }
        return { ok: true, status: 200, json: async () => body } as unknown as Response
      }) as unknown as typeof fetch,
    })

    const [game] = await provider.listPopular!('game', 1)

    expect(game?.description).toBe('A story about crime.')
    expect(seen.some((url) => url.includes('/games/3498'))).toBe(true)
  })

  /*
   * Enrichment must never fail an import that has already succeeded. A game
   * without a synopsis is the status quo; a failed import is not.
   */
  it('keeps the game when its synopsis lookup fails', async () => {
    const provider = createRawgProvider({
      apiKey: 'k',
      fetchImpl: (async (input: string | URL) => {
        if (/\/games\/\d+\?/.test(String(input))) {
          return { ok: false, status: 500, json: async () => ({}) } as unknown as Response
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ results: [LISTED_GAME] }),
        } as unknown as Response
      }) as unknown as typeof fetch,
    })

    const games = await provider.listPopular!('game', 1)

    expect(games).toHaveLength(1)
    expect(games[0]?.title).toBe('Grand Theft Auto V')
    expect(games[0]?.description).toBeNull()
  })

  it('reads a missing release date as null rather than an empty string', async () => {
    const provider = createRawgProvider({
      apiKey: 'k',
      fetchImpl: stub({ results: [{ ...LISTED_GAME, released: '' }] }),
    })

    const [game] = await provider.listPopular!('game', 1)
    expect(game?.releaseDate).toBeNull()
  })
})

describe('every provider the registry hands out can be imported from', () => {
  /*
   * The regression guard.
   *
   * Configuring a provider must never produce a worse catalogue than
   * configuring none. Whichever credentials are present, the provider chosen
   * for each type has to support the bulk list the importer calls -- otherwise
   * that type silently imports zero rows.
   */
  const credentials = [
    { name: 'nothing configured', options: {} },
    { name: 'RAWG configured', options: { rawgApiKey: 'k' } },
    {
      name: 'IGDB configured',
      options: { igdbClientId: 'id', igdbClientSecret: 'secret' },
    },
    {
      name: 'IGDB and RAWG configured',
      options: { igdbClientId: 'id', igdbClientSecret: 'secret', rawgApiKey: 'k' },
    },
    { name: 'TMDB configured', options: { tmdbApiKey: 'k' } },
  ] as const

  it.each(credentials)('$name leaves every provider able to bulk list', ({ options }) => {
    const registry = createProviderRegistry(options)

    for (const mediaType of MEDIA_TYPES) {
      const provider = registry.forType(mediaType)
      if (!provider) continue

      expect(
        typeof provider.listPopular,
        `${provider.key} serves "${mediaType}" but cannot bulk list, so the import would ` +
          'skip that type entirely',
      ).toBe('function')
    }
  })
})
