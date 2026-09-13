import { createIgdbProvider } from '@revy/core'
import { describe, expect, it } from 'vitest'

/**
 * IGDB provider behaviour (SPEC 8, 43).
 *
 * IGDB authenticates through Twitch, so the interesting behaviour is not the
 * field mapping but the token lifecycle: it must be fetched once, reused, and
 * dropped when rejected. Those are the failures that would otherwise show up
 * as "search works, then stops working days later".
 */

interface Call {
  url: string
  body?: string
  headers: Record<string, string>
}

function stub(options: {
  games?: unknown[]
  tokenExpiresIn?: number
  tokenStatus?: number
  gamesStatus?: number
} = {}) {
  const calls: Call[] = []
  let tokensIssued = 0

  const impl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = (init?.headers ?? {}) as Record<string, string>
    calls.push({ url, body: init?.body as string | undefined, headers })

    if (url.includes('id.twitch.tv')) {
      tokensIssued++
      const status = options.tokenStatus ?? 200
      return {
        ok: status === 200,
        status,
        json: async () => ({
          access_token: `token-${tokensIssued}`,
          expires_in: options.tokenExpiresIn ?? 5_000_000,
        }),
      } as Response
    }

    const status = options.gamesStatus ?? 200
    return {
      ok: status === 200,
      status,
      json: async () => options.games ?? [],
    } as Response
  }) as unknown as typeof fetch

  return { impl, calls, tokensIssued: () => tokensIssued }
}

const provider = (impl: typeof fetch) =>
  createIgdbProvider({ clientId: 'cid', clientSecret: 'secret', fetchImpl: impl })

describe('token lifecycle', () => {
  it('exchanges credentials for a token before querying', async () => {
    const { impl, calls } = stub()
    await provider(impl).search({ query: 'zelda', limit: 5 })

    expect(calls[0]!.url).toContain('id.twitch.tv')
    expect(calls[0]!.url).toContain('grant_type=client_credentials')
    expect(calls[1]!.url).toContain('api.igdb.com')
  })

  it('sends both the Client-ID and the bearer token', async () => {
    const { impl, calls } = stub()
    await provider(impl).search({ query: 'zelda', limit: 5 })

    // IGDB requires both; sending only the bearer returns 401.
    expect(calls[1]!.headers['Client-ID']).toBe('cid')
    expect(calls[1]!.headers.authorization).toBe('Bearer token-1')
  })

  it('reuses a cached token across requests', async () => {
    // Twitch issues these for ~60 days. Fetching one per request would be slow
    // and rude, and would eventually get the app rate limited.
    const { impl, tokensIssued } = stub()
    const p = provider(impl)

    await p.search({ query: 'a', limit: 5 })
    await p.search({ query: 'b', limit: 5 })
    await p.search({ query: 'c', limit: 5 })

    expect(tokensIssued()).toBe(1)
  })

  it('re-authenticates once a token has expired', async () => {
    const { impl, tokensIssued } = stub({ tokenExpiresIn: 1 })
    const p = provider(impl)

    await p.search({ query: 'a', limit: 5 })
    await p.search({ query: 'b', limit: 5 })

    expect(tokensIssued()).toBe(2)
  })

  it('drops a rejected token so the next call can recover', async () => {
    // Without this the provider would cache a revoked token and fail forever.
    const { impl, tokensIssued } = stub({ gamesStatus: 401 })
    const p = provider(impl)

    await expect(p.search({ query: 'a', limit: 5 })).rejects.toThrow()
    await expect(p.search({ query: 'b', limit: 5 })).rejects.toThrow()

    expect(tokensIssued()).toBe(2)
  })

  it('names the likely cause when Twitch rejects the credentials', async () => {
    const { impl } = stub({ tokenStatus: 400 })
    await expect(provider(impl).search({ query: 'a', limit: 5 })).rejects.toThrow(
      /IGDB_CLIENT_ID/,
    )
  })
})

describe('queries', () => {
  it('filters to standalone games, excluding DLC and bundles', async () => {
    const { impl, calls } = stub()
    await provider(impl).search({ query: 'hades', limit: 5 })

    // Without this, expansions and soundtracks enter the catalogue as titles.
    expect(calls[1]!.body).toContain('category = (0,4,8,9)')
  })

  it('strips quotes that would break out of the query string', async () => {
    const { impl, calls } = stub()
    await provider(impl).search({ query: 'the "best" game', limit: 5 })

    const search = calls[1]!.body!.match(/search "([^"]*)"/)![1]
    expect(search).not.toContain('"')
  })

  it('returns nothing for a non-game media type', async () => {
    const { impl } = stub()
    expect(await provider(impl).search({ query: 'x', limit: 5, mediaType: 'movie' })).toEqual([])
  })
})

describe('field mapping', () => {
  const game = {
    id: 1029,
    name: 'The Legend of Zelda: Breath of the Wild',
    summary: 'Step into a world of discovery.',
    first_release_date: 1488499200, // 2017-03-03
    cover: { image_id: 'co3p2d' },
    artworks: [{ image_id: 'ar1x2y' }],
    genres: [{ name: 'Adventure' }, { name: 'RPG' }],
    platforms: [{ name: 'Nintendo Switch' }, { name: 'Wii U' }],
    involved_companies: [
      { developer: true, company: { name: 'Nintendo EPD' } },
      { developer: false, company: { name: 'Nintendo' } },
    ],
  }

  it('maps a console exclusive that Steam could never return', async () => {
    const { impl } = stub({ games: [game] })
    const result = await provider(impl).getByExternalId('1029', 'game')

    expect(result!.title).toBe('The Legend of Zelda: Breath of the Wild')
    expect(result!.metadata.platforms).toEqual(['Nintendo Switch', 'Wii U'])
  })

  it('converts unix release dates to ISO', async () => {
    const { impl } = stub({ games: [game] })
    const result = await provider(impl).getByExternalId('1029', 'game')
    expect(result!.releaseDate).toBe('2017-03-03')
  })

  it('keeps only actual developers, not publishers', async () => {
    const { impl } = stub({ games: [game] })
    const result = await provider(impl).getByExternalId('1029', 'game')
    expect(result!.metadata.developers).toEqual(['Nintendo EPD'])
  })

  it('builds image URLs from the image id', async () => {
    const { impl } = stub({ games: [game] })
    const result = await provider(impl).getByExternalId('1029', 'game')
    expect(result!.coverImageUrl).toContain('co3p2d.jpg')
    expect(result!.backdropImageUrl).toContain('ar1x2y.jpg')
  })

  it('tolerates a game with no date, cover or companies', async () => {
    // Common for older and obscure titles, which is exactly what IGDB is for.
    const { impl } = stub({ games: [{ id: 7, name: 'Obscure Title' }] })
    const result = await provider(impl).getByExternalId('7', 'game')

    expect(result!.title).toBe('Obscure Title')
    expect(result!.releaseDate).toBeNull()
    expect(result!.coverImageUrl).toBeNull()
    expect(result!.metadata.developers).toBeUndefined()
  })

  it('returns null for an unknown id', async () => {
    const { impl } = stub({ games: [] })
    expect(await provider(impl).getByExternalId('999999', 'game')).toBeNull()
  })

  it('rejects a non-numeric id without calling the API', async () => {
    const { impl, calls } = stub()
    expect(await provider(impl).getByExternalId('not-a-number', 'game')).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
