import type { MediaMetadata, MediaType } from '@revy/shared/types'

/**
 * The media provider abstraction (SPEC 8).
 *
 * SPEC 49.2 forbids coupling the domain to any external catalogue. Everything
 * outside this folder speaks only in `ProviderMedia`; nothing else in the
 * codebase knows that TMDB or Open Library exist. Swapping a provider means
 * writing one new file and changing one line of the registry.
 */

/** A normalised catalogue item, before it becomes a local `media` row. */
export interface ProviderMedia {
  /** Stable id within the provider. */
  externalId: string
  /** Provider key, e.g. 'tmdb'. Paired with externalId for uniqueness. */
  provider: string
  mediaType: MediaType
  title: string
  originalTitle: string | null
  description: string | null
  /** ISO date (YYYY-MM-DD) or null when the provider gives only a year. */
  releaseDate: string | null
  coverImageUrl: string | null
  backdropImageUrl: string | null
  metadata: MediaMetadata
}

/** A lighter shape returned by search, where details cost an extra request. */
export interface ProviderSearchResult {
  externalId: string
  provider: string
  mediaType: MediaType
  title: string
  releaseDate: string | null
  coverImageUrl: string | null
  /** Author / network / director hint for the result row. Display only. */
  subtitle: string | null
}

export interface ProviderSearchParams {
  query: string
  limit: number
}

/**
 * Every provider implements exactly this. Keep it small: the wider the
 * interface, the harder it is to add a provider for a new media type later.
 */
export interface MediaProvider {
  /** Provider key stored on the media row. Must be stable forever. */
  readonly key: string
  /** Which media types this provider can serve. */
  readonly mediaTypes: readonly MediaType[]

  search(params: ProviderSearchParams): Promise<ProviderSearchResult[]>

  /** Full details for one item. Returns null when the id is unknown. */
  getByExternalId(externalId: string, mediaType: MediaType): Promise<ProviderMedia | null>

  /**
   * Catalogue-level trending, used by Discover (SPEC 21) before there is
   * enough in-app activity to rank by. Optional: providers without a trending
   * endpoint simply omit it and the section falls back to local popularity.
   */
  getTrending?(mediaType: MediaType, limit: number): Promise<ProviderSearchResult[]>
}

/** Thrown by providers on transport failure; mapped to PROVIDER_UNAVAILABLE. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    options?: { cause?: unknown; status?: number },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'ProviderError'
    this.status = options?.status
  }

  readonly status: number | undefined
}
