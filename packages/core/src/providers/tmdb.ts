import type { CreditRole, MediaType } from '@revy/shared/types'
import {
  ProviderError,
  type MediaProvider,
  type ProviderCredit,
  type ProviderMedia,
  type ProviderRating,
  type ProviderSearchParams,
  type ProviderSearchResult,
  type ProviderTranslation,
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
/*
 * Store the provider's best, resize at the point of use.
 *
 * These were w500 and w1280, which threw away most of the resolution TMDB
 * holds -- Endgame's backdrop is 3840x2160 and its poster 2000x3000, and we
 * were serving a quarter of that to every screen, including full-bleed ones.
 *
 * Size is not fixed here any more because it cannot be: a poster is 92px wide
 * in a search result and 500px in a hero, and the right answer also depends on
 * the device pixel ratio. `imageAtWidth` in @revy/shared picks per use.
 *
 * Note the ceiling varies per title -- it is whatever was uploaded. Some are
 * 3840 wide, some are 1280 and cannot go higher, which is why any design that
 * fills a screen with one backdrop has to check before committing to it.
 */
/**
 * Ratings a title needs before the bulk import will carry it.
 *
 * The import walks `vote_count.desc`, so this only bites in the tail -- but
 * the tail is thousands of pages long, and without a floor the importer
 * eventually fills the catalogue with titles nobody has heard of, which is
 * the problem it exists to avoid.
 */
const POPULAR_MINIMUM_VOTES = 500

const POSTER_SIZE = 'original'
const BACKDROP_SIZE = 'original'

/**
 * Faces are the exception to storing the provider's best.
 *
 * A profile photo is never displayed larger than a thumbnail in a cast strip,
 * and there are a dozen of them per title -- so unlike posters and backdrops,
 * which one screen shows one of at full bleed, here the original resolution
 * is bytes nobody will ever see.
 */
const PROFILE_SIZE = 'w185'

interface TmdbMovie {
  /** TMDB's own community average, 0-10. Not IMDb's. */
  vote_average?: number
  vote_count?: number
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
  total_pages?: number
}

interface TmdbGenreResponse {
  genres?: Array<{ id: number; name: string }>
}

interface TmdbCreditPerson {
  id: number
  name?: string
  profile_path?: string | null
  known_for_department?: string
  /** Cast only. */
  character?: string
  order?: number
  /** Crew only: 'Director', 'Writer', 'Screenplay', ... */
  job?: string
  department?: string
}

interface TmdbTranslation {
  iso_639_1?: string
  iso_3166_1?: string
  data?: {
    /** Movies. */
    title?: string
    /** Series. */
    name?: string
    overview?: string
  }
}

interface TmdbTranslationsResponse {
  translations?: TmdbTranslation[]
}

/**
 * Which TMDB locales fill which of ours, in order of preference.
 *
 * TMDB keys translations by language *and country*, and our locales are not
 * all that specific. `pt-BR` maps straight across. `es` does not: TMDB carries
 * both `es-ES` and `es-MX`, and they are genuinely different films by name --
 * The Dark Knight is "El caballero oscuro" in Spain and "Batman: El caballero
 * de la noche" in Mexico.
 *
 * Peninsular Spanish leads because `es` with no region conventionally means it,
 * and because a reader who wants the Latin American title is better served by
 * us adding `es-MX` as its own locale than by us guessing which they meant.
 */
/** Our locale as TMDB spells it. Falls through to the locale itself. */
function tmdbLocale(locale: string): string {
  return WANTED_LOCALES[locale]?.[0] ?? locale
}

const WANTED_LOCALES: Record<string, string[]> = {
  'pt-BR': ['pt-BR', 'pt-PT'],
  es: ['es-ES', 'es-MX', 'es-AR'],
}

interface TmdbCreditsResponse {
  cast?: TmdbCreditPerson[]
  crew?: TmdbCreditPerson[]
  /** `/tv/{id}/aggregate_credits` nests the part inside `roles`. */
  created_by?: TmdbCreditPerson[]
}

/**
 * How many cast members are worth keeping.
 *
 * TMDB lists everybody, down to "Party Guest #4", in credit order. Past the
 * first dozen the names stop being why anyone watched the thing, and every
 * extra row is a `people` row plus a credit row plus a face to download.
 */
const CAST_LIMIT = 12

/**
 * Crew jobs worth a credit, mapped to our roles.
 *
 * An allowlist rather than everything: a film has a hundred and fifty crew
 * credits and four of them are what somebody means by "who made this". The
 * rest belong in a database that is about film production, which this is not.
 */
const CREW_JOBS: Record<string, CreditRole> = {
  Director: 'director',
  Writer: 'writer',
  Screenplay: 'writer',
  Story: 'writer',
  Creator: 'creator',
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

  /**
   * Genre id -> name, fetched once per type.
   *
   * List endpoints return `genre_ids` while detail endpoints return named
   * `genres`. Caching this map is what lets bulk import build complete records
   * from a list payload instead of one detail request per title.
   */
  const genreCache = new Map<string, Map<number, string>>()

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

  async function genreMap(mediaType: 'movie' | 'series'): Promise<Map<number, string>> {
    const cached = genreCache.get(mediaType)
    if (cached) return cached

    const path = mediaType === 'movie' ? '/genre/movie/list' : '/genre/tv/list'
    const data = await request<TmdbGenreResponse>(path, {})
    const map = new Map((data.genres ?? []).map((genre) => [genre.id, genre.name]))

    genreCache.set(mediaType, map)
    return map
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
      locale,
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
            /*
             * The reader's language, mapped to a TMDB locale.
             *
             * TMDB wants language *and* region, and `es` alone means Spain to
             * it -- the same mapping `WANTED_LOCALES` already encodes for
             * fetching translations, reused here so search and detail cannot
             * disagree about which Spanish a reader gets.
             */
            ...(locale ? { language: tmdbLocale(locale) } : {}),
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
          /*
           * TMDB's own score, not IMDb's.
           *
           * Worth being exact about, because the two get conflated constantly:
           * IMDb ratings are licensed and not redistributable, and neither are
           * Rotten Tomatoes'. This is TMDB's community average, already on a
           * 0-10 scale, and the UI attributes it as TMDB.
           */
          ...(typeof item.vote_average === 'number' && item.vote_average > 0
            ? {
                externalRating: {
                  source: 'TMDB',
                  score: Math.round(item.vote_average * 10) / 10,
                  votes: item.vote_count ?? 0,
                },
              }
            : {}),
        },
      }
    },

    /**
     * A page of popular titles as complete records (SPEC 8).
     *
     * TMDB's list endpoints carry overview, both images and genre ids, so one
     * request yields twenty finished rows. Fetching details per title would be
     * twenty times the requests for the same data.
     */
    async listPopular(mediaType, page): Promise<ProviderMedia[]> {
      if (mediaType !== 'movie' && mediaType !== 'series') return []

      /*
       * Most-rated of all time, not most-viewed this week.
       *
       * This used `/movie/popular` and `/tv/popular`, and that is what filled
       * the catalogue with regional soaps and breakfast television: TMDB's
       * "popular" is weighted by recent page views, so it answers "what is
       * being looked at right now" rather than "what is worth having". A
       * catalogue seeded from it has no Fight Club and four Polish medical
       * dramas.
       *
       * `/discover` sorted by vote count answers the other question, and the
       * floor keeps the tail honest -- past a few thousand pages the ordering
       * runs out of well-known titles and a minimum is what stops it
       * scraping the bottom.
       */
      const path = mediaType === 'movie' ? '/discover/movie' : '/discover/tv'
      const [data, genres] = await Promise.all([
        request<TmdbSearchResponse>(path, {
          page: String(page),
          sort_by: 'vote_count.desc',
          'vote_count.gte': String(POPULAR_MINIMUM_VOTES),
          include_adult: 'false',
        }),
        genreMap(mediaType),
      ])

      return (data.results ?? [])
        // A title with no poster is a grey rectangle in every rail it appears
        // in. TMDB's popular pages carry plenty with art, so skip rather than
        // pad -- this is what put "CITV Breakfast" in the catalogue.
        .filter((item) => (mediaType === 'movie' ? item.title : item.name) && item.poster_path)
        .map((item) => ({
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
            genres: (item.genre_ids ?? [])
              .map((id) => genres.get(id))
              .filter((name): name is string => typeof name === 'string'),
            /*
             * The same capture as the detail path above, and it has to be
             * repeated here rather than shared.
             *
             * These two mappings look alike and are not: the detail endpoint
             * returns `genres` as objects, the list endpoint returns
             * `genre_ids` against a lookup, and factoring them together would
             * mean a function that takes both shapes and picks. The cost of
             * the duplication is this comment; the cost of not noticing it was
             * a catalogue imported with no provider scores at all, because
             * only one of the two was updated.
             */
            ...(typeof item.vote_average === 'number' && item.vote_average > 0
              ? {
                  externalRating: {
                    source: 'TMDB',
                    score: Math.round(item.vote_average * 10) / 10,
                    votes: item.vote_count ?? 0,
                  },
                }
              : {}),
          },
        }))
    },

    async getTrending(mediaType, limit): Promise<ProviderSearchResult[]> {
      if (mediaType === 'book') return []
      const segment = mediaType === 'movie' ? 'movie' : 'tv'
      const data = await request<TmdbSearchResponse>(`/trending/${segment}/week`, {})
      return (data.results ?? []).slice(0, limit).map((item) => toSearchResult(item, mediaType))
    },

    /**
     * The score TMDB holds *now*, not the one we captured at import.
     *
     * A title imported before release has `vote_average: 0`, so it is stored
     * with no score -- and nothing ever looked again. Avatar: Fire and Ash was
     * blank in the catalogue nine months after release while TMDB had 7.6 from
     * four thousand people.
     */
    async getRating(externalId, mediaType): Promise<ProviderRating | null> {
      if (mediaType !== 'movie' && mediaType !== 'series') return null

      const segment = mediaType === 'movie' ? 'movie' : 'tv'
      const item = await request<TmdbMovie>(`/${segment}/${externalId}`, {})

      if (typeof item.vote_average !== 'number' || item.vote_average <= 0) return null

      return {
        source: 'TMDB',
        score: Math.round(item.vote_average * 10) / 10,
        votes: item.vote_count ?? 0,
      }
    },

    async getTranslations(externalId, mediaType): Promise<ProviderTranslation[]> {
      if (mediaType !== 'movie' && mediaType !== 'series') return []

      const segment = mediaType === 'movie' ? 'movie' : 'tv'
      const data = await request<TmdbTranslationsResponse>(
        `/${segment}/${externalId}/translations`,
        {},
      )

      const byLocale = new Map<string, TmdbTranslation>()
      for (const entry of data.translations ?? []) {
        byLocale.set(`${entry.iso_639_1}-${entry.iso_3166_1}`, entry)
      }

      const out: ProviderTranslation[] = []

      for (const [locale, candidates] of Object.entries(WANTED_LOCALES)) {
        // First match wins, so the preference order in the table is the whole
        // decision -- see the note there about es-ES over es-MX.
        const match = candidates.map((tag) => byLocale.get(tag)).find(Boolean)
        if (!match) continue

        const title = match.data?.title?.trim() || match.data?.name?.trim() || null
        const description = match.data?.overview?.trim() || null

        // A locale TMDB lists but has not filled in is not a translation.
        if (!title && !description) continue

        out.push({ language: locale, title, description })
      }

      return out
    },

    async getCredits(externalId, mediaType): Promise<ProviderCredit[]> {
      if (mediaType !== 'movie' && mediaType !== 'series') return []

      const segment = mediaType === 'movie' ? 'movie' : 'tv'
      const data = await request<TmdbCreditsResponse>(`/${segment}/${externalId}/credits`, {})

      const credits: ProviderCredit[] = []

      function push(person: TmdbCreditPerson, role: CreditRole, billing: number) {
        if (!person.name) return
        credits.push({
          externalId: String(person.id),
          provider: 'tmdb',
          name: person.name,
          imageUrl: imageUrl(person.profile_path, PROFILE_SIZE),
          role,
          character: role === 'cast' ? (person.character ?? null) : null,
          billing,
          metadata: person.known_for_department
            ? { knownForDepartment: person.known_for_department }
            : {},
        })
      }

      // Cast in credit order, which is TMDB's own billing and the only signal
      // for "who is actually in this" versus "who is in one scene".
      const cast = (data.cast ?? [])
        .slice()
        .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
        .slice(0, CAST_LIMIT)

      cast.forEach((person, index) => push(person, 'cast', index))

      /*
       * Crew, allowlisted by job, deduplicated per person and role.
       *
       * TMDB credits one writer separately for "Story" and "Screenplay" on the
       * same film, which both map to `writer` here -- and the unique index is
       * on (media, person, role), so sending both would make the insert fail
       * on a perfectly ordinary film.
       */
      const seen = new Set<string>()
      let billing = 0

      for (const person of data.crew ?? []) {
        const role = person.job ? CREW_JOBS[person.job] : undefined
        if (!role) continue

        const key = `${person.id}:${role}`
        if (seen.has(key)) continue
        seen.add(key)

        push(person, role, billing++)
      }

      // Series carry their creators outside the crew list.
      for (const person of data.created_by ?? []) {
        const key = `${person.id}:creator`
        if (seen.has(key)) continue
        seen.add(key)
        push(person, 'creator', billing++)
      }

      return credits
    },
  }
}
