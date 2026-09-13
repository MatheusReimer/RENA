import type { MediaType } from '@revy/shared/types'
import {
  ProviderError,
  type MediaProvider,
  type ProviderMedia,
  type ProviderSearchParams,
  type ProviderSearchResult,
} from './types'

/**
 * TMDB provider for movies and series (SPEC 8).
 *
 * Requires TMDB_API_KEY. Per TMDB's terms the app must display an
 * attribution notice; that lives in the web app's footer, not here.
 */

const API_BASE = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

/** Poster width used for cards and detail headers. */
const POSTER_SIZE = 'w500'
const BACKDROP_SIZE = 'w1280'

interface TmdbMovie {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  overview?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  backdrop_path?: string | null
  genres?: Array<{ id: number; name: string }>
  genre_ids?: number[]
  runtime?: number
  episode_run_time?: number[]
  number_of_seasons?: number
  number_of_episodes?: number
}

interface TmdbSearchResponse {
  results?: TmdbMovie[]
}

export interface TmdbProviderOptions {
  apiKey: string
  /** Injected so tests can stub HTTP without a network. */
  fetchImpl?: typeof fetch
}

export function createTmdbProvider(options: TmdbProviderOptions): MediaProvider {
  const doFetch = options.fetchImpl ?? fetch

  async function request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`)
    url.searchParams.set('api_key', options.apiKey)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await doFetch(url, { headers: { accept: 'application/json' } })
    } catch (cause) {
      throw new ProviderError('tmdb', 'Could not reach TMDB.', { cause })
    }

    if (!response.ok) {
      throw new ProviderError('tmdb', `TMDB responded with ${response.status}.`, {
        status: response.status,
      })
    }

    return (await response.json()) as T
  }

  function imageUrl(path: string | null | undefined, size: string): string | null {
    return path ? `${IMAGE_BASE}/${size}${path}` : null
  }

  /** TMDB uses `title`/`release_date` for movies and `name`/`first_air_date` for TV. */
  function titleOf(item: TmdbMovie, mediaType: MediaType): string {
    return (mediaType === 'movie' ? item.title : item.name) ?? item.title ?? item.name ?? 'Untitled'
  }

  function releaseOf(item: TmdbMovie, mediaType: MediaType): string | null {
    const raw = mediaType === 'movie' ? item.release_date : item.first_air_date
    // TMDB returns '' rather than null for unknown dates, which Postgres
    // rejects as a date. Normalise to null here so callers never see it.
    return raw && raw.length > 0 ? raw : null
  }

  function toSearchResult(item: TmdbMovie, mediaType: MediaType): ProviderSearchResult {
    return {
      externalId: String(item.id),
      provider: 'tmdb',
      mediaType,
      title: titleOf(item, mediaType),
      releaseDate: releaseOf(item, mediaType),
      coverImageUrl: imageUrl(item.poster_path, POSTER_SIZE),
      subtitle: null,
    }
  }

  return {
    key: 'tmdb',
    mediaTypes: ['movie', 'series'],

    async search({ query, limit }: ProviderSearchParams): Promise<ProviderSearchResult[]> {
      // One call per type keeps results attributable to a media type; TMDB's
      // /search/multi mixes in people, which we do not model as media.
      const [movies, series] = await Promise.all([
        request<TmdbSearchResponse>('/search/movie', { query, include_adult: 'false' }),
        request<TmdbSearchResponse>('/search/tv', { query, include_adult: 'false' }),
      ])

      const results = [
        ...(movies.results ?? []).map((item) => toSearchResult(item, 'movie')),
        ...(series.results ?? []).map((item) => toSearchResult(item, 'series')),
      ]

      return results.slice(0, limit)
    },

    async getByExternalId(externalId, mediaType): Promise<ProviderMedia | null> {
      if (mediaType === 'book') return null

      const path = mediaType === 'movie' ? `/movie/${externalId}` : `/tv/${externalId}`

      let item: TmdbMovie
      try {
        item = await request<TmdbMovie>(path, {})
      } catch (error) {
        if (error instanceof ProviderError && error.status === 404) return null
        throw error
      }

      const runtime =
        mediaType === 'movie' ? item.runtime : item.episode_run_time?.[0]

      return {
        externalId: String(item.id),
        provider: 'tmdb',
        mediaType,
        title: titleOf(item, mediaType),
        originalTitle:
          (mediaType === 'movie' ? item.original_title : item.original_name) ?? null,
        description: item.overview && item.overview.length > 0 ? item.overview : null,
        releaseDate: releaseOf(item, mediaType),
        coverImageUrl: imageUrl(item.poster_path, POSTER_SIZE),
        backdropImageUrl: imageUrl(item.backdrop_path, BACKDROP_SIZE),
        metadata: {
          genres: item.genres?.map((genre) => genre.name) ?? [],
          ...(runtime ? { runtimeMinutes: runtime } : {}),
          ...(item.number_of_seasons ? { seasonCount: item.number_of_seasons } : {}),
          ...(item.number_of_episodes ? { episodeCount: item.number_of_episodes } : {}),
        },
      }
    },

    async getTrending(mediaType, limit): Promise<ProviderSearchResult[]> {
      if (mediaType === 'book') return []
      const segment = mediaType === 'movie' ? 'movie' : 'tv'
      const data = await request<TmdbSearchResponse>(`/trending/${segment}/week`, {})
      return (data.results ?? []).slice(0, limit).map((item) => toSearchResult(item, mediaType))
    },
  }
}
