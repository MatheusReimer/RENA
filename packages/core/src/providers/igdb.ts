import {
  ProviderError,
  type MediaProvider,
  type ProviderMedia,
  type ProviderSearchParams,
  type ProviderSearchResult,
} from './types'

/**
 * IGDB provider for games (SPEC 8).
 *
 * The most complete games catalogue available: every platform, back to the
 * 1970s, including console and retro titles that a storefront API cannot see.
 * This is the one to use when "all games" actually means all games.
 *
 * It costs an OAuth step. IGDB authenticates through Twitch: a client id and
 * secret are exchanged for an app access token, which is then sent on every
 * request. That exchange is handled here -- callers supply two static values
 * and never think about tokens.
 */

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const API_BASE = 'https://api.igdb.com/v4'
const IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload'

/** Rows per bulk-list page. IGDB permits 500; 50 keeps each request modest. */
const PAGE_SIZE = 50

/**
 * IGDB `game_type` values that are standalone games.
 *
 * The field also covers DLC (1), expansions (2), bundles (3), mods (5) and
 * episodes (6). Including them would put "Hades: Soundtrack"-shaped entries in
 * the catalogue, so every query filters to these.
 *
 * The field was called `category` until IGDB renamed it, and the rename is
 * worth a note because of how it failed: the old name does not error. A
 * `where category = (...)` clause matches nothing and returns `[]`, and
 * `fields category` is dropped from the response without comment. So the
 * provider went on working in every visible respect while returning an empty
 * catalogue -- search, detail, trending and the bulk list all silently. If
 * this ever returns nothing again, suspect a renamed field before suspecting
 * the credentials.
 */
const MAIN_GAME = 0
const STANDALONE_EXPANSION = 4
const REMAKE = 8
const REMASTER = 9
const GAME_TYPES = [MAIN_GAME, STANDALONE_EXPANSION, REMAKE, REMASTER]

interface IgdbImage {
  image_id?: string
}

interface IgdbNamed {
  name?: string
}

interface IgdbCompany {
  developer?: boolean
  company?: IgdbNamed
}

interface IgdbGame {
  id: number
  name?: string
  summary?: string
  storyline?: string
  /** Unix seconds. */
  first_release_date?: number
  cover?: IgdbImage
  artworks?: IgdbImage[]
  screenshots?: IgdbImage[]
  genres?: IgdbNamed[]
  platforms?: IgdbNamed[]
  involved_companies?: IgdbCompany[]
  /** Critic and player scores combined, 0-100. */
  total_rating?: number
  total_rating_count?: number
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
}

export interface IgdbProviderOptions {
  /** Twitch application client id. */
  clientId: string
  /** Twitch application client secret. */
  clientSecret: string
  /** Injected so tests can stub HTTP without a network. */
  fetchImpl?: typeof fetch
}

/** Fields requested on every query, as one Apicalypse clause. */
const FIELDS = [
  'name',
  'total_rating',
  'total_rating_count',
  'summary',
  'first_release_date',
  'cover.image_id',
  'artworks.image_id',
  'screenshots.image_id',
  'genres.name',
  'platforms.name',
  'involved_companies.developer',
  'involved_companies.company.name',
].join(',')

export function createIgdbProvider(options: IgdbProviderOptions): MediaProvider {
  const doFetch = options.fetchImpl ?? fetch

  /**
   * Cached app access token.
   *
   * Twitch issues these for roughly 60 days, so fetching one per request would
   * be both slow and rude. Refreshed a minute before expiry so a request never
   * races the boundary.
   */
  let token: { value: string; expiresAt: number } | null = null

  async function accessToken(): Promise<string> {
    if (token && token.expiresAt > Date.now()) return token.value

    const url =
      `${TOKEN_URL}?client_id=${encodeURIComponent(options.clientId)}` +
      `&client_secret=${encodeURIComponent(options.clientSecret)}` +
      '&grant_type=client_credentials'

    let response: Response
    try {
      response = await doFetch(url, { method: 'POST' })
    } catch (cause) {
      throw new ProviderError('igdb', 'Could not reach Twitch for an IGDB token.', { cause })
    }

    if (!response.ok) {
      // Almost always a wrong client id or secret, which is worth saying
      // plainly rather than surfacing as a generic 401 later.
      throw new ProviderError(
        'igdb',
        'Twitch rejected the IGDB credentials. Check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET.',
        { status: response.status },
      )
    }

    const data = (await response.json()) as TokenResponse
    if (!data.access_token) {
      throw new ProviderError('igdb', 'Twitch returned no access token.')
    }

    // Refreshed a minute early so a request never races the boundary, but
    // never cached past what Twitch actually granted -- clamping upward would
    // mean confidently sending a token we know is dead.
    const lifetime = data.expires_in ?? 3600
    token = {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(0, lifetime - 60) * 1000,
    }
    return token.value
  }

  /** IGDB takes an Apicalypse query as a plain-text POST body. */
  async function query(endpoint: string, body: string): Promise<IgdbGame[]> {
    const bearer = await accessToken()

    let response: Response
    try {
      response = await doFetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Client-ID': options.clientId,
          authorization: `Bearer ${bearer}`,
          accept: 'application/json',
        },
        body,
      })
    } catch (cause) {
      throw new ProviderError('igdb', 'Could not reach IGDB.', { cause })
    }

    if (response.status === 401) {
      // The cached token was rejected -- revoked, or the app was rotated.
      // Drop it so the next call re-authenticates rather than failing forever.
      token = null
      throw new ProviderError('igdb', 'IGDB rejected the access token.', { status: 401 })
    }

    if (!response.ok) {
      throw new ProviderError('igdb', `IGDB responded with ${response.status}.`, {
        status: response.status,
      })
    }

    return (await response.json()) as IgdbGame[]
  }

  function imageUrl(image: IgdbImage | undefined, size: string): string | null {
    return image?.image_id ? `${IMAGE_BASE}/t_${size}/${image.image_id}.jpg` : null
  }

  /** IGDB dates are unix seconds; the domain stores ISO dates. */
  function toReleaseDate(seconds: number | undefined): string | null {
    if (!seconds) return null
    const date = new Date(seconds * 1000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }

  /**
   * An IGDB game as the domain stores it.
   *
   * Shared by the detail lookup and the bulk list. The catalogue is built by
   * one and read by the other, so a field added to only one produces titles
   * whose metadata depends on how they happened to be discovered.
   */
  function toMedia(game: IgdbGame): ProviderMedia {
    const developers = (game.involved_companies ?? [])
      .filter((entry) => entry.developer && entry.company?.name)
      .map((entry) => entry.company!.name!)

    const platforms = (game.platforms ?? [])
      .map((platform) => platform.name)
      .filter((name): name is string => typeof name === 'string')

    return {
      externalId: String(game.id),
      provider: 'igdb',
      mediaType: 'game',
      title: game.name!,
      originalTitle: null,
      description: game.summary?.trim() || null,
      releaseDate: toReleaseDate(game.first_release_date),
      coverImageUrl: imageUrl(game.cover, 'cover_big'),
      // Artwork is the closest thing to a backdrop; a screenshot is the
      // fallback, and many older titles have neither.
      backdropImageUrl:
        imageUrl(game.artworks?.[0], '1080p') ?? imageUrl(game.screenshots?.[0], '1080p'),
      metadata: {
        genres: (game.genres ?? [])
          .map((genre) => genre.name)
          .filter((name): name is string => typeof name === 'string'),
        ...(platforms.length ? { platforms } : {}),
        ...(developers.length ? { developers } : {}),
        /*
         * IGDB's combined critic-and-player score, 0-100, rescaled to the
         * 0-10 the domain stores. Only kept where enough people have voted
         * for it to mean anything -- a "94" from three votes is noise wearing
         * the costume of a consensus.
         */
        ...(typeof game.total_rating === 'number' && (game.total_rating_count ?? 0) >= 5
          ? {
              externalRating: {
                source: 'IGDB',
                score: Math.round(game.total_rating) / 10,
                votes: game.total_rating_count ?? 0,
              },
            }
          : {}),
      },
    }
  }

  function toSearchResult(game: IgdbGame): ProviderSearchResult {
    return {
      externalId: String(game.id),
      provider: 'igdb',
      mediaType: 'game',
      title: game.name ?? 'Untitled',
      releaseDate: toReleaseDate(game.first_release_date),
      coverImageUrl: imageUrl(game.cover, 'cover_big'),
      subtitle: game.platforms?.[0]?.name ?? null,
    }
  }

  const gameTypeFilter = `game_type = (${GAME_TYPES.join(',')})`

  return {
    key: 'igdb',
    mediaTypes: ['game'],

    async search({ query: term, limit, mediaType }: ProviderSearchParams): Promise<
      ProviderSearchResult[]
    > {
      if (mediaType && mediaType !== 'game') return []

      // `search` cannot be combined with `sort`, and quotes in the term would
      // break out of the Apicalypse string, so they are stripped.
      const safe = term.replace(/["\\]/g, ' ').trim()
      if (!safe) return []

      const games = await query(
        'games',
        `search "${safe}"; fields ${FIELDS}; where ${gameTypeFilter}; limit ${Math.min(limit, 50)};`,
      )

      return games.filter((game) => game.name).map(toSearchResult)
    },

    async getByExternalId(externalId, mediaType): Promise<ProviderMedia | null> {
      if (mediaType !== 'game') return null

      const id = Number(externalId)
      if (!Number.isInteger(id)) return null

      const [game] = await query(
        'games',
        `fields ${FIELDS}; where id = ${id} & ${gameTypeFilter}; limit 1;`,
      )

      if (!game?.name) return null

      return toMedia(game)
    },

    /**
     * The catalogue import's entry point (SPEC 8).
     *
     * Added alongside RAWG's, and for the same reason: the importer skips any
     * provider that cannot bulk list, and this one sits *first* in the game
     * fallback chain. Configuring IGDB -- the best games catalogue we can
     * reach, and the one worth the OAuth dance -- therefore produced a
     * catalogue with no games in it at all.
     *
     * Sorted by how many people have rated a title, which on IGDB is the
     * closest thing to fame. Sorting by score instead fills the catalogue with
     * obscure titles holding a perfect ten from eleven voters.
     */
    async listPopular(mediaType, page): Promise<ProviderMedia[]> {
      if (mediaType !== 'game') return []

      const games = await query(
        'games',
        `fields ${FIELDS};` +
          ` where ${gameTypeFilter}` +
          ' & cover != null & total_rating_count > 5;' +
          ' sort total_rating_count desc;' +
          ` limit ${PAGE_SIZE}; offset ${(page - 1) * PAGE_SIZE};`,
      )

      return games.filter((game) => game.name).map(toMedia)
    },

    async getTrending(type, limit): Promise<ProviderSearchResult[]> {
      if (type !== 'game') return []

      // IGDB has no trending endpoint. Recently released, well-rated titles is
      // the closest honest approximation -- and unlike `search`, this query
      // can sort.
      const threeMonthsAgo = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60
      const now = Math.floor(Date.now() / 1000)

      const games = await query(
        'games',
        `fields ${FIELDS};` +
          ` where ${gameTypeFilter}` +
          ` & first_release_date > ${threeMonthsAgo}` +
          ` & first_release_date < ${now}` +
          ' & cover != null & total_rating_count > 5;' +
          ' sort total_rating_count desc;' +
          ` limit ${Math.min(limit, 50)};`,
      )

      return games.filter((game) => game.name).map(toSearchResult)
    },
  }
}
