import {
  ProviderError,
  type MediaProvider,
  type ProviderMedia,
  type ProviderSearchParams,
  type ProviderSearchResult,
} from './types'

/**
 * RAWG provider for games (SPEC 8).
 *
 * Chosen over IGDB because it is a single free API key rather than an OAuth
 * client id/secret pair that has to be exchanged for a token on every boot.
 * Behind the same `MediaProvider` interface as everything else, so swapping to
 * IGDB later is one new file plus a registry line.
 */

const API_BASE = 'https://api.rawg.io/api'

interface RawgGame {
  id: number
  slug?: string
  name?: string
  description_raw?: string
  released?: string | null
  background_image?: string | null
  genres?: Array<{ name: string }>
  platforms?: Array<{ platform?: { name?: string } }>
  developers?: Array<{ name: string }>
  playtime?: number
}

interface RawgSearchResponse {
  results?: RawgGame[]
}

export interface RawgProviderOptions {
  apiKey: string
  /** Injected so tests can stub HTTP without a network. */
  fetchImpl?: typeof fetch
}

export function createRawgProvider(options: RawgProviderOptions): MediaProvider {
  const doFetch = options.fetchImpl ?? fetch

  async function request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`)
    url.searchParams.set('key', options.apiKey)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await doFetch(url, { headers: { accept: 'application/json' } })
    } catch (cause) {
      throw new ProviderError('rawg', 'Could not reach RAWG.', { cause })
    }

    if (!response.ok) {
      throw new ProviderError('rawg', `RAWG responded with ${response.status}.`, {
        status: response.status,
      })
    }

    return (await response.json()) as T
  }

  /** RAWG returns '' or null for unknown release dates; Postgres needs null. */
  function releaseOf(game: RawgGame): string | null {
    return game.released && game.released.length > 0 ? game.released : null
  }

  function toSearchResult(game: RawgGame): ProviderSearchResult {
    return {
      externalId: String(game.id),
      provider: 'rawg',
      mediaType: 'game',
      title: game.name ?? 'Untitled',
      releaseDate: releaseOf(game),
      // Games have no portrait cover art; `background_image` is the only
      // artwork RAWG exposes, so it serves as both cover and backdrop. The
      // poster component crops it to the shared aspect ratio.
      coverImageUrl: game.background_image ?? null,
      subtitle: game.genres?.[0]?.name ?? null,
    }
  }

  return {
    key: 'rawg',
    mediaTypes: ['game'],

    async search({ query, limit }: ProviderSearchParams): Promise<ProviderSearchResult[]> {
      const data = await request<RawgSearchResponse>('/games', {
        search: query,
        page_size: String(Math.min(limit, 40)),
      })

      return (data.results ?? []).slice(0, limit).map(toSearchResult)
    },

    async getByExternalId(externalId, mediaType): Promise<ProviderMedia | null> {
      if (mediaType !== 'game') return null

      let game: RawgGame
      try {
        game = await request<RawgGame>(`/games/${externalId}`, {})
      } catch (error) {
        if (error instanceof ProviderError && error.status === 404) return null
        throw error
      }

      const platforms = (game.platforms ?? [])
        .map((entry) => entry.platform?.name)
        .filter((name): name is string => typeof name === 'string')

      return {
        externalId: String(game.id),
        provider: 'rawg',
        mediaType: 'game',
        title: game.name ?? 'Untitled',
        originalTitle: null,
        description:
          game.description_raw && game.description_raw.length > 0 ? game.description_raw : null,
        releaseDate: releaseOf(game),
        coverImageUrl: game.background_image ?? null,
        backdropImageUrl: game.background_image ?? null,
        metadata: {
          genres: game.genres?.map((genre) => genre.name) ?? [],
          ...(platforms.length ? { platforms } : {}),
          ...(game.developers?.length
            ? { developers: game.developers.map((dev) => dev.name) }
            : {}),
          // RAWG reports average playtime in hours; the domain stores minutes.
          ...(game.playtime ? { runtimeMinutes: game.playtime * 60 } : {}),
        },
      }
    },

    async getTrending(mediaType, limit): Promise<ProviderSearchResult[]> {
      if (mediaType !== 'game') return []

      // RAWG has no trending endpoint; "most recently added, highly rated"
      // is the closest honest approximation.
      const data = await request<RawgSearchResponse>('/games', {
        ordering: '-added',
        page_size: String(Math.min(limit, 40)),
      })

      return (data.results ?? []).slice(0, limit).map(toSearchResult)
    },
  }
}
