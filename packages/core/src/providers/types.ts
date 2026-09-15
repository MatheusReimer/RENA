import type { CreditRole, MediaMetadata, MediaType, PersonMetadata } from '@revy/shared/types'

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
  /**
   * Narrows the search to one media type, when the caller asked for one.
   *
   * A provider serving several types must honour this rather than searching
   * everything and letting the caller filter: filtering after a limit has been
   * applied silently drops whole types. Omitted means "everything you serve".
   */
  mediaType?: MediaType
  /**
   * The reader's language, as a provider should interpret it.
   *
   * Not a filter -- TMDB's index already matches localised titles, so
   * searching "O Poderoso Chefao" finds The Godfather with or without this.
   * What it changes is which title comes *back*: without it the result is
   * labelled "The Godfather", which reads to a Portuguese speaker as the
   * search having failed rather than as an untranslated label.
   *
   * Omitted means the provider's default, which is English everywhere we use.
   */
  locale?: string
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

  /**
   * A page of popular titles, as full records ready to persist.
   *
   * Exists for bulk catalogue import, which is a different job from search:
   * search answers a question, this fills an empty database. It returns
   * `ProviderMedia` rather than search results precisely so the importer does
   * not have to fetch details per row -- most catalogues include everything
   * needed in the list payload, and one request per page beats one per title
   * by a factor of twenty.
   *
   * Pages are 1-indexed. An empty array means there are no more.
   */
  listPopular?(mediaType: MediaType, page: number): Promise<ProviderMedia[]>

  /**
   * Who worked on one title.
   *
   * Optional, and most providers will never have it: Open Library gives
   * authors as plain strings on the work itself, and RAWG gives developers
   * the same way, both of which the importer already reads out of
   * `metadata`. This exists for the providers that model people as entities
   * with their own ids and photographs -- which today is TMDB alone.
   *
   * Its own call rather than part of `getByExternalId`, because it is a
   * second request at the provider either way and the bulk importer builds
   * whole pages of titles without ever needing it.
   */
  getCredits?(externalId: string, mediaType: MediaType): Promise<ProviderCredit[]>

  /**
   * The provider's current aggregate score for one title.
   *
   * Exists because `metadata.externalRating` is captured once, at import, and
   * then frozen. A title imported before release has no votes yet, so it is
   * stored with no score and keeps none forever -- Avatar: Fire and Ash sat
   * blank in the catalogue months after release, while TMDB had 7.6 from four
   * thousand people.
   *
   * Also the only way to get a book score at all: Open Library's search
   * payload carries no rating, and its `ratings.json` is a separate request
   * per work.
   *
   * Returns null when the provider genuinely has nothing -- which is a real
   * answer, and different from "we never asked".
   */
  getRating?(externalId: string, mediaType: MediaType): Promise<ProviderRating | null>

  /**
   * The provider's own blurb for one title.
   *
   * Only implemented where the bulk list payload omits it. Open Library's
   * `/search.json` returns no description at all, which is why every book in
   * the catalogue had a blank hover caption while films and games had one --
   * it lives on the work document, a separate request each.
   */
  getDescription?(externalId: string, mediaType: MediaType): Promise<string | null>

  /**
   * The title and description in every language the provider has them.
   *
   * All languages in one call, not one call per language: TMDB's
   * `/translations` returns seventy at once, and asking per locale would
   * multiply a catalogue-wide backfill by the number of languages the
   * interface might ever add.
   *
   * These are editorial, not translated. "Batman: O Cavaleiro das Trevas" is
   * what the film is called in Brazil, and no translator would derive it from
   * "The Dark Knight" -- which is the whole reason to prefer a provider that
   * has this over running the original text through a model.
   */
  getTranslations?(externalId: string, mediaType: MediaType): Promise<ProviderTranslation[]>
}

/**
 * A provider's aggregate score, normalised.
 *
 * Always 0-10, whatever the provider's own scale, and always carrying
 * `source`, because this is somebody else's number and every screen showing
 * it has to say whose.
 */
export interface ProviderRating {
  /** Attribution, shown to the reader: 'TMDB', 'Open Library', 'Metacritic'. */
  source: string
  /** 0-10, one decimal. */
  score: number
  /** How many people it is based on; 0 when the provider does not say. */
  votes: number
}

/** Catalogue text in one language, as a provider holds it. */
export interface ProviderTranslation {
  /** BCP-47 as the interface uses it: 'pt-BR', 'es'. */
  language: string
  /** Null when the provider has a description but no distinct release title. */
  title: string | null
  description: string | null
}

/** One person's credit on one title, as a provider reports it. */
export interface ProviderCredit {
  /** Stable id within the provider. */
  externalId: string
  provider: string
  name: string
  imageUrl: string | null
  role: CreditRole
  /** Cast only. */
  character: string | null
  /** The provider's own ordering within the role; 0 is top billing. */
  billing: number
  metadata: PersonMetadata
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
