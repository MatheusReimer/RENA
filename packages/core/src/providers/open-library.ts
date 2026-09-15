import {
  ProviderError,
  type MediaProvider,
  type ProviderMedia,
  type ProviderSearchParams,
  type ProviderRating,
  type ProviderSearchResult,
} from './types'

/**
 * Open Library provider for books (SPEC 8).
 *
 * Chosen over Google Books for the MVP because it needs no API key, which
 * means book search works on a fresh clone with no credentials. It is behind
 * the same `MediaProvider` interface, so switching to Google Books later is a
 * one-file change plus a registry line.
 */

const API_BASE = 'https://openlibrary.org'

/**
 * Open Library scores books out of five; everything else here is out of ten.
 *
 * Normalised at capture so no screen has to know which provider a number came
 * from in order to draw it -- the same reason TMDB's ten-point scale is kept
 * as-is and RAWG's Metacritic percentage is divided by ten.
 */
const OPEN_LIBRARY_SCALE = 2

interface OpenLibraryRatings {
  summary?: { average?: number; count?: number }
}

interface OpenLibraryWork {
  /** A plain string on older records, a typed object on newer ones. */
  description?: string | { type?: string; value?: string }
}

const COVER_BASE = 'https://covers.openlibrary.org/b/id'

interface OpenLibraryDoc {
  key?: string
  title?: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  number_of_pages_median?: number
  publisher?: string[]
  subject?: string[]
}

interface OpenLibrarySearchResponse {
  docs?: OpenLibraryDoc[]
}

export interface OpenLibraryProviderOptions {
  fetchImpl?: typeof fetch
}

/**
 * Subjects walked for bulk import.
 *
 * Open Library has no "popular books" endpoint, so breadth comes from asking
 * for well-populated subjects and paging through each. Chosen to span fiction
 * and non-fiction rather than to be exhaustive -- a catalogue that is all
 * science fiction is not a catalogue.
 */
const IMPORT_SUBJECTS = [
  'science_fiction',
  'fantasy',
  'fiction',
  'history',
  'biography',
  'philosophy',
  'mystery',
  'horror',
  'poetry',
  'psychology',
]

export function createOpenLibraryProvider(
  options: OpenLibraryProviderOptions = {},
): MediaProvider {
  const doFetch = options.fetchImpl ?? fetch

  async function request<T>(path: string, params: Record<string, string>): Promise<T> {
    const url = new URL(`${API_BASE}${path}`)
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }

    let response: Response
    try {
      response = await doFetch(url, { headers: { accept: 'application/json' } })
    } catch (cause) {
      throw new ProviderError('open-library', 'Could not reach Open Library.', { cause })
    }

    if (!response.ok) {
      throw new ProviderError('open-library', `Open Library responded with ${response.status}.`, {
        status: response.status,
      })
    }

    return (await response.json()) as T
  }

  /**
   * Open Library work keys look like '/works/OL45804W'. We store the bare id
   * so the external id never contains a slash and stays URL-safe.
   */
  function toExternalId(key: string | undefined): string | null {
    if (!key) return null
    const parts = key.split('/')
    return parts[parts.length - 1] ?? null
  }

  function coverUrl(coverId: number | undefined, size: 'M' | 'L'): string | null {
    return coverId ? `${COVER_BASE}/${coverId}-${size}.jpg` : null
  }

  /** Open Library gives a year, not a full date; normalise to Jan 1 of it. */
  function toReleaseDate(year: number | undefined): string | null {
    return year && year > 0 ? `${year}-01-01` : null
  }

  function toSearchResult(doc: OpenLibraryDoc): ProviderSearchResult | null {
    const externalId = toExternalId(doc.key)
    if (!externalId || !doc.title) return null

    return {
      externalId,
      provider: 'open-library',
      mediaType: 'book',
      title: doc.title,
      releaseDate: toReleaseDate(doc.first_publish_year),
      coverImageUrl: coverUrl(doc.cover_i, 'M'),
      subtitle: doc.author_name?.[0] ?? null,
    }
  }

  return {
    key: 'open-library',
    mediaTypes: ['book'],

    /**
     * A work's community rating, which the search payload does not carry.
     *
     * This is why every book in the catalogue showed no score at all: the
     * import reads `/search.json`, and ratings live at their own endpoint,
     * one request per work. Worth the request only for a backfill, never
     * during a bulk import.
     */
    async getRating(externalId): Promise<ProviderRating | null> {
      let data: OpenLibraryRatings
      try {
        data = await request<OpenLibraryRatings>(`/works/${externalId}/ratings.json`, {})
      } catch (error) {
        // A work with no ratings at all 404s here rather than returning an
        // empty summary, which is not a failure -- it is the answer.
        if (error instanceof ProviderError && error.status === 404) return null
        throw error
      }

      const average = data.summary?.average
      const count = data.summary?.count ?? 0

      // `average` is present but null on works nobody has rated.
      if (typeof average !== 'number' || average <= 0 || count === 0) return null

      return {
        source: 'Open Library',
        score: Math.round(average * OPEN_LIBRARY_SCALE * 10) / 10,
        votes: count,
      }
    },

    /**
     * A work's blurb, which the search payload also does not carry.
     *
     * Open Library stores this two ways and has for years: older records hold
     * a plain string, newer ones a `{ type, value }` object. Reading only one
     * shape silently returns nothing for roughly half the catalogue, which is
     * indistinguishable from a book that genuinely has no description.
     */
    async getDescription(externalId): Promise<string | null> {
      let data: OpenLibraryWork
      try {
        data = await request<OpenLibraryWork>(`/works/${externalId}.json`, {})
      } catch (error) {
        if (error instanceof ProviderError && error.status === 404) return null
        throw error
      }

      const raw =
        typeof data.description === 'string' ? data.description : data.description?.value

      if (!raw) return null

      /*
       * Strip the source note these blurbs so often end with.
       *
       * A good share of Open Library descriptions close with a line like
       * "([source][1])" or a bare "----------" rule followed by provenance.
       * It is meaningful on the work page and noise in a two-line caption.
       */
      const cleaned = raw
        .split(/\n-{3,}|\r?\n\r?\n\(\[/)[0]!
        .replace(/\[([^\]]+)\]\[\d+\]/g, '$1')
        .trim()

      return cleaned.length > 0 ? cleaned : null
    },

    async search({ query, limit }: ProviderSearchParams): Promise<ProviderSearchResult[]> {
      const data = await request<OpenLibrarySearchResponse>('/search.json', {
        q: query,
        limit: String(Math.min(limit, 40)),
        // Requesting only the fields we map keeps the response small; the
        // default payload is enormous.
        fields: 'key,title,author_name,first_publish_year,cover_i',
      })

      return (data.docs ?? [])
        .map(toSearchResult)
        .filter((result): result is ProviderSearchResult => result !== null)
        .slice(0, limit)
    },

    /**
     * A page of books from one subject (SPEC 8).
     *
     * The page number selects the subject as well as the offset, so walking
     * pages 1..N sweeps across subjects rather than exhausting one.
     */
    async listPopular(mediaType, page): Promise<ProviderMedia[]> {
      if (mediaType !== 'book') return []

      const subject = IMPORT_SUBJECTS[(page - 1) % IMPORT_SUBJECTS.length]!
      const round = Math.floor((page - 1) / IMPORT_SUBJECTS.length)

      const data = await request<OpenLibrarySearchResponse>('/search.json', {
        q: `subject:${subject}`,
        limit: '50',
        offset: String(round * 50),
        sort: 'readinglog',
        fields:
          'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher,subject',
      })

      return (data.docs ?? [])
        .map((doc): ProviderMedia | null => {
          const externalId = toExternalId(doc.key)
          // A book with no cover is a row nobody will click. At import scale
          // there are plenty with one, so skip rather than pad.
          if (!externalId || !doc.title || !doc.cover_i) return null

          return {
            externalId,
            provider: 'open-library',
            mediaType: 'book' as const,
            title: doc.title,
            originalTitle: null,
            description: null,
            releaseDate: toReleaseDate(doc.first_publish_year),
            coverImageUrl: coverUrl(doc.cover_i, 'L'),
            backdropImageUrl: null,
            metadata: {
              authors: doc.author_name ?? [],
              genres: doc.subject?.slice(0, 6) ?? [],
              ...(doc.number_of_pages_median
                ? { pageCount: doc.number_of_pages_median }
                : {}),
              ...(doc.publisher?.[0] ? { publisher: doc.publisher[0] } : {}),
            },
          }
        })
        .filter((item): item is ProviderMedia => item !== null)
    },

    async getByExternalId(externalId, mediaType): Promise<ProviderMedia | null> {
      if (mediaType !== 'book') return null

      // The search endpoint filtered by key returns the same enriched shape as
      // /works/{id}.json but with author names already resolved, which saves a
      // second round trip to /authors/{id}.json.
      const data = await request<OpenLibrarySearchResponse>('/search.json', {
        q: `key:/works/${externalId}`,
        limit: '1',
        fields:
          'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher,subject',
      })

      const doc = data.docs?.[0]
      if (!doc || !doc.title) return null

      const subjects = doc.subject?.slice(0, 6) ?? []

      return {
        externalId,
        provider: 'open-library',
        mediaType: 'book',
        title: doc.title,
        originalTitle: null,
        description: null,
        releaseDate: toReleaseDate(doc.first_publish_year),
        coverImageUrl: coverUrl(doc.cover_i, 'L'),
        // Books have no backdrop art; the detail page falls back to a blurred
        // cover, handled in the UI rather than faked here.
        backdropImageUrl: null,
        metadata: {
          authors: doc.author_name ?? [],
          genres: subjects,
          ...(doc.number_of_pages_median ? { pageCount: doc.number_of_pages_median } : {}),
          ...(doc.publisher?.[0] ? { publisher: doc.publisher[0] } : {}),
        },
      }
    },
  }
}
