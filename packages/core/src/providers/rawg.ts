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

/**
 * How many synopsis lookups run at once, and how long each worker waits.
 *
 * Both numbers are small because the first attempt at this was not. Fetching
 * a synopsis per title multiplies a page of forty into forty-one requests, and
 * at four in flight RAWG began answering the *list* endpoint with 502s -- five
 * of fifteen pages lost, from enrichment that is not worth a single missing
 * game. The same pages returned 200 immediately when fetched alone, so this
 * was self-inflicted rather than RAWG being unreliable.
 *
 * Two at a time with a pause between them keeps a page under RAWG's tolerance.
 * It makes the import slower and that is the correct trade: an import runs
 * rarely and unattended, and a fast one that drops a third of the catalogue is
 * not fast.
 */
const DETAIL_CONCURRENCY = 2
const DETAIL_DELAY_MS = 120

/** RAWG caps a page at 40, and rejects anything larger outright. */
const PAGE_SIZE = 40

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
  /** Metacritic's aggregate, 0-100. Absent for most titles. */
  metacritic?: number | null
  /** RAWG's own player score, 0-5. */
  rating?: number
  ratings_count?: number
}

/**
 * Metacritic where it exists, RAWG's own player score otherwise.
 *
 * Metacritic first because it is the number people actually recognise for
 * games, and it is attributed as Metacritic rather than as RAWG -- RAWG is
 * the pipe, not the source. Most titles have no Metacritic entry at all, and
 * for those the player score is better than nothing, so long as the label
 * says which one the reader is looking at.
 */
function externalRating(game: RawgGame) {
  if (typeof game.metacritic === 'number' && game.metacritic > 0) {
    return {
      externalRating: {
        source: 'Metacritic',
        score: Math.round(game.metacritic) / 10,
        votes: 0,
      },
    }
  }

  if (typeof game.rating === 'number' && game.rating > 0 && (game.ratings_count ?? 0) >= 5) {
    return {
      externalRating: {
        // RAWG scores out of 5; the domain stores out of 10.
        source: 'RAWG',
        score: Math.round(game.rating * 2 * 10) / 10,
        votes: game.ratings_count ?? 0,
      },
    }
  }

  return {}
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

  /**
   * A RAWG game as the domain stores it.
   *
   * Shared by the detail lookup and the bulk list, which matter equally and
   * are easy to let drift -- the catalogue is built by one path and read by
   * the other, so a field added to only one produces titles whose metadata
   * depends on how they were discovered.
   *
   * The list endpoint omits `description_raw` and `developers`, so both are
   * null on a row that came from there. `listPopular` fills the description
   * back in with a second call per title, because the media page shows one;
   * `developers` stays absent, because nothing does.
   */
  function toMedia(game: RawgGame): ProviderMedia {
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
        /*
         * How many people rated it on RAWG, kept whichever score we show.
         *
         * `externalRating.votes` cannot carry this: when the displayed score
         * is Metacritic's, its sample size is the critic count, which RAWG
         * does not publish. Putting a player-rating count there would state
         * something false about where the number came from.
         */
        ...(game.ratings_count ? { popularity: game.ratings_count } : {}),
        ...externalRating(game),
      },
    }
  }

  /**
   * Fills in synopses, slowly, tolerating failure.
   *
   * Errors are swallowed by design: this is enrichment, and one flaky lookup
   * must not fail an import whose list request already succeeded. A game
   * without a synopsis is the status quo -- books have none either.
   */
  async function hydrateDescriptions(games: ProviderMedia[]): Promise<void> {
    const queue = [...games]

    async function worker() {
      for (let next = queue.pop(); next; next = queue.pop()) {
        try {
          const detail = await request<RawgGame>(`/games/${next.externalId}`, {})
          if (detail.description_raw) next.description = detail.description_raw
        } catch {
          // Leave it without one. Nothing downstream requires a description.
        }
        // Paced even on failure: a 429 or 502 is exactly when backing off
        // matters, and skipping the wait there would tighten the loop at the
        // moment it should loosen.
        await new Promise((resolve) => setTimeout(resolve, DETAIL_DELAY_MS))
      }
    }

    await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, worker))
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

      return toMedia(game)
    },

    /**
     * The catalogue import's entry point (SPEC 8).
     *
     * Its absence was a real bug rather than a missing nicety: the importer
     * skips a provider that cannot bulk list, and the registry prefers RAWG
     * over Steam whenever a key is set. So configuring RAWG -- the thing you
     * do to get *better* games -- silently produced no games at all, where
     * having no key produced Steam's hundred.
     *
     * Ordered by `-added`, which is how many RAWG users hold the game in a
     * library. That is a popularity signal rather than a quality one, and it
     * is the right one here: this list decides what the catalogue contains,
     * and a catalogue of critically adored titles nobody has heard of is the
     * complaint this import exists to answer. Metacritic still reaches the
     * reader, as the score on the card.
     */
    async listPopular(mediaType, page): Promise<ProviderMedia[]> {
      if (mediaType !== 'game') return []

      const data = await request<RawgSearchResponse>('/games', {
        ordering: '-added',
        page: String(page),
        page_size: String(PAGE_SIZE),
      })

      const games = (data.results ?? []).map(toMedia)

      /*
       * Descriptions come from a second call each, and that is worth it.
       *
       * RAWG's list carries artwork, genres, platforms and a Metacritic score
       * but no synopsis -- so without this the media page for every game would
       * render with the description simply absent. IGDB's list includes one,
       * which means switching provider would otherwise be a visible downgrade
       * on a page nobody was asking to change.
       *
       * It costs one request per title: a few hundred against a free tier
       * measured in tens of thousands per month, once, at import. Bounded
       * concurrency keeps that polite rather than a burst, and a failure is
       * absorbed -- a game with no synopsis is the status quo, and it is not
       * worth failing an import over.
       */
      await hydrateDescriptions(games)
      return games
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
