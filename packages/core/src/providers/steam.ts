import {
  ProviderError,
  type MediaProvider,
  type ProviderMedia,
  type ProviderSearchParams,
  type ProviderSearchResult,
} from './types'

/**
 * Steam provider for games (SPEC 8).
 *
 * The keyless fallback. RAWG is the better catalogue -- it covers console
 * exclusives, which Steam by definition cannot -- but it needs an API key, and
 * signing up for one is a hard dependency on a third party being available.
 * Steam's storefront endpoints need nothing, so games work on a fresh clone.
 *
 * The registry prefers RAWG when a key is configured and falls back to this.
 *
 * Known limitation: a Steam-only catalogue has no Zelda, no Mario, no
 * PlayStation exclusive that never came to PC. Rating those requires RAWG.
 *
 * These are undocumented storefront endpoints rather than a published API.
 * They are stable in practice and widely used, but they carry no compatibility
 * promise -- which is an argument for RAWG in production, not against having a
 * fallback that works today.
 */

const SEARCH_URL = 'https://store.steampowered.com/api/storesearch'
const DETAILS_URL = 'https://store.steampowered.com/api/appdetails'

/**
 * Search terms walked for bulk import.
 *
 * Steam's only keyless "popular" surface is its featured carousel, which is a
 * few dozen entries skewed to whatever is on sale. Sweeping broad genre terms
 * reaches far more of the catalogue, and the page number picks the term.
 */
const IMPORT_TERMS = [
  'rpg', 'strategy', 'adventure', 'roguelike', 'simulation', 'platformer',
  'shooter', 'puzzle', 'horror', 'racing', 'survival', 'metroidvania',
  'city builder', 'soulslike', 'deckbuilder', 'open world',
]

interface SteamSearchItem {
  id: number
  name?: string
  tiny_image?: string
}

interface SteamSearchResponse {
  items?: SteamSearchItem[]
}

interface SteamAppDetails {
  type?: string
  name?: string
  short_description?: string
  detailed_description?: string
  header_image?: string
  capsule_imagev5?: string
  release_date?: { coming_soon?: boolean; date?: string }
  genres?: Array<{ description: string }>
  developers?: string[]
  publishers?: string[]
  platforms?: Record<string, boolean>
}

type SteamDetailsResponse = Record<string, { success?: boolean; data?: SteamAppDetails }>

/**
 * Store entries that are not games.
 *
 * Steam's search returns soundtracks and demos alongside the games they belong
 * to, and its `category1=998` games filter is silently ignored on this
 * endpoint (verified). `appdetails` reports a real `type`, but fetching it for
 * every search result would be one request per row -- so search uses this
 * conservative name filter and `getByExternalId` enforces the real check.
 */
const NON_GAME_SUFFIXES = [
  'soundtrack',
  'ost',
  'demo',
  'artbook',
  'art book',
  'wallpaper',
  'season pass',
  'dlc',
]

function looksLikeAGame(name: string): boolean {
  const lower = name.toLowerCase()
  return !NON_GAME_SUFFIXES.some((suffix) => lower.includes(suffix))
}

/**
 * Steam renders dates for humans: "17 Sep, 2020", "Sep 2020", "2020",
 * "Coming soon". Postgres needs an ISO date or null, and a half-parsed date is
 * worse than none -- so anything not confidently resolvable returns null.
 */
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function parseSteamDate(raw: string | undefined): string | null {
  if (!raw) return null
  const text = raw.trim().toLowerCase()
  if (text.length === 0) return null

  const year = text.match(/\b(19|20)\d{2}\b/)?.[0]
  if (!year) return null

  const month = Object.keys(MONTHS).find((name) => text.includes(name))
  if (!month) return `${year}-01-01`

  const day = text.match(/\b(\d{1,2})\b(?!\d)/)?.[1]
  const dayPart = day && Number(day) >= 1 && Number(day) <= 31 ? day.padStart(2, '0') : '01'

  return `${year}-${MONTHS[month]}-${dayPart}`
}

export interface SteamProviderOptions {
  /** Injected so tests can stub HTTP without a network. */
  fetchImpl?: typeof fetch
}

export function createSteamProvider(options: SteamProviderOptions = {}): MediaProvider {
  const doFetch = options.fetchImpl ?? fetch

  async function request<T>(url: string): Promise<T> {
    let response: Response
    try {
      response = await doFetch(url, { headers: { accept: 'application/json' } })
    } catch (cause) {
      throw new ProviderError('steam', 'Could not reach Steam.', { cause })
    }

    if (!response.ok) {
      throw new ProviderError('steam', `Steam responded with ${response.status}.`, {
        status: response.status,
      })
    }

    return (await response.json()) as T
  }

  return {
    key: 'steam',
    mediaTypes: ['game'],

    async search({ query, limit, mediaType }: ProviderSearchParams): Promise<
      ProviderSearchResult[]
    > {
      if (mediaType && mediaType !== 'game') return []

      const url = `${SEARCH_URL}/?term=${encodeURIComponent(query)}&cc=us&l=en`
      const data = await request<SteamSearchResponse>(url)

      return (data.items ?? [])
        .filter((item) => item.name && looksLikeAGame(item.name))
        .slice(0, limit)
        .map((item) => ({
          externalId: String(item.id),
          provider: 'steam',
          mediaType: 'game' as const,
          title: item.name!,
          // Search results carry no date; the detail fetch fills it in when
          // the title is opened. Guessing one here would be worse than null.
          releaseDate: null,
          coverImageUrl: item.tiny_image ?? null,
          subtitle: null,
        }))
    },

    /**
     * A page of games (SPEC 8).
     *
     * Unlike TMDB, Steam's search payload carries no genres or dates, so these
     * rows are deliberately thin: id, title and art. That is enough to browse
     * and rate; opening one resolves the full record through
     * `getByExternalId`, which is where the type check lives anyway.
     */
    async listPopular(mediaType, page): Promise<ProviderMedia[]> {
      if (mediaType !== 'game') return []

      const term = IMPORT_TERMS[(page - 1) % IMPORT_TERMS.length]!
      const url = `${SEARCH_URL}/?term=${encodeURIComponent(term)}&cc=us&l=en`
      const data = await request<SteamSearchResponse>(url)

      return (data.items ?? [])
        .filter((item) => item.name && looksLikeAGame(item.name) && item.tiny_image)
        .map((item) => ({
          externalId: String(item.id),
          provider: 'steam',
          mediaType: 'game' as const,
          title: item.name!,
          originalTitle: null,
          description: null,
          releaseDate: null,
          coverImageUrl: item.tiny_image ?? null,
          backdropImageUrl: item.tiny_image ?? null,
          metadata: {},
        }))
    },

    async getByExternalId(externalId, mediaType): Promise<ProviderMedia | null> {
      if (mediaType !== 'game') return null

      const url = `${DETAILS_URL}?appids=${encodeURIComponent(externalId)}&cc=us&l=en`
      const payload = await request<SteamDetailsResponse>(url)
      const entry = payload[externalId]

      if (!entry?.success || !entry.data) return null

      const data = entry.data

      // The real filter. Search may surface a soundtrack or DLC; nothing but
      // an actual game is allowed to become a media row.
      if (data.type !== 'game' || !data.name) return null

      const platforms = Object.entries(data.platforms ?? {})
        .filter(([, supported]) => supported)
        .map(([name]) => (name === 'mac' ? 'macOS' : name === 'windows' ? 'PC' : 'Linux'))

      return {
        externalId,
        provider: 'steam',
        mediaType: 'game',
        title: data.name,
        originalTitle: null,
        description: data.short_description?.trim() || null,
        releaseDate: parseSteamDate(data.release_date?.date),
        // `header_image` is a 460x215 banner. It is the only artwork Steam
        // exposes here, so it serves as both cover and backdrop; the poster
        // component crops it to the shared ratio.
        coverImageUrl: data.capsule_imagev5 ?? data.header_image ?? null,
        backdropImageUrl: data.header_image ?? null,
        metadata: {
          genres: data.genres?.map((genre) => genre.description) ?? [],
          ...(platforms.length ? { platforms } : {}),
          ...(data.developers?.length ? { developers: data.developers } : {}),
        },
      }
    },
  }
}
