import {
  ProviderError,
  type MediaProvider,
  type ProviderMedia,
  type ProviderSearchParams,
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
