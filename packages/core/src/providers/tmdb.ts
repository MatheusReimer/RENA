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
  /**
   * Either credential TMDB issues:
   *
   *  - a v3 API key (32 hex characters), sent as `?api_key=`
   *  - a v4 Read Access Token (a JWT), sent as `Authorization: Bearer`
   *
   * TMDB's own settings page offers both and does not make the difference
   * obvious, so the provider detects which one it was given rather than
   * failing with a 401 that looks like a bad key.
   */
  apiKey: string
  /** Injected so tests can stub HTTP without a network. */
  fetchImpl?: typeof fetch
}

/** v4 tokens are JWTs; v3 keys are plain hex. */
function isReadAccessToken(credential: string): boolean {
  return credential.startsWith('eyJ') && credential.split('.').length === 3
}

export function createTmdbProvider(options: TmdbProviderOptions): MediaProvider {
  const doFetch = options.fetchImpl ?? fetch
  const useBearer = isReadAccessToken(options.apiKey)

  async function request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`)
    if (!useBearer) url.searchParams.set('api_key', options.apiKey)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    const headers: Record<string, string> = { accept: 'application/json' }
    if (useBearer) headers.authorization = `Bearer ${options.apiKey}`

    let response: Response
    try {
      response = await doFetch(url, { headers })
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

    async search({
      query,
      limit,
      mediaType,
    }: ProviderSearchParams): Promise<ProviderSearchResult[]> {
      // One call per type keeps results attributable to a media type; TMDB's
      // /search/multi mixes in people, which we do not model as media.
      //
      // When a type is requested we query only that endpoint. Querying both
      // and slicing afterwards put every movie ahead of every series, so a
      // series search with a small limit returned nothing at all.
      const wanted: Array<'movie' | 'series'> =
        mediaType === 'movie' || mediaType === 'series' ? [mediaType] : ['movie', 'series']

      const responses = await Promise.all(
        wanted.map((type) =>
          request<TmdbSearchResponse>(type === 'movie' ? '/search/movie' : '/search/tv', {
            query,
            include_adult: 'false',
          }).then((data) => ({ type, data })),
        ),
      )

      // Interleaved rather than concatenated, so an unfiltered search cannot
      // fill the whole page with one type either.
      const byType = responses.map(({ type, data }) =>
        (data.results ?? []).map((item) => toSearchResult(item, type)),
      )

      const results: ProviderSearchResult[] = []
      for (let i = 0; results.length < limit; i++) {
        const before = results.length
        for (const bucket of byType) {
          const item = bucket[i]
          if (item) results.push(item)
          if (results.length === limit) break
        }
        if (results.length === before) break
      }

      return results
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
