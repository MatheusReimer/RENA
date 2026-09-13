import { MEDIA_TYPES } from '@revy/shared/constants'
import type { MediaType } from '@revy/shared/types'
import { createOpenLibraryProvider } from './open-library'
import { createTmdbProvider } from './tmdb'
import type { MediaProvider, ProviderSearchResult } from './types'

/**
 * Routes each media type to its provider (SPEC 8).
 *
 * This is the only place that knows which catalogue serves which type.
 * `providers/` is the boundary: everything above it works with the internal
 * Media domain and never names a vendor.
 */

export interface ProviderRegistryOptions {
  tmdbApiKey?: string | undefined
  fetchImpl?: typeof fetch
}

export interface ProviderRegistry {
  /** The provider for a media type, or null when none is configured. */
  forType(mediaType: MediaType): MediaProvider | null
  /** Every distinct configured provider. */
  all(): MediaProvider[]
  /**
   * Searches every configured provider, or just one type's provider.
   * A provider that fails is skipped rather than failing the whole search --
   * a TMDB outage should not take book results down with it.
   */
  searchAll(
    query: string,
    limit: number,
    mediaType?: MediaType,
  ): Promise<{ results: ProviderSearchResult[]; failed: string[] }>
}

export function createProviderRegistry(options: ProviderRegistryOptions): ProviderRegistry {
  const byType = new Map<MediaType, MediaProvider>()

  // Movies and series: TMDB, when a key is configured. Without a key the app
  // still runs and book search works -- a deliberately soft dependency so a
  // fresh clone is usable before anyone signs up for an API key.
  if (options.tmdbApiKey) {
    const tmdb = createTmdbProvider({
      apiKey: options.tmdbApiKey,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    })
    byType.set('movie', tmdb)
    byType.set('series', tmdb)
  }

  const openLibrary = createOpenLibraryProvider(
    options.fetchImpl ? { fetchImpl: options.fetchImpl } : {},
  )
  byType.set('book', openLibrary)

  function all(): MediaProvider[] {
    return [...new Set(byType.values())]
  }

  return {
    forType: (mediaType) => byType.get(mediaType) ?? null,

    all,

    async searchAll(query, limit, mediaType) {
      const targets = mediaType
        ? [byType.get(mediaType)].filter((p): p is MediaProvider => p !== undefined)
        : all()

      const failed: string[] = []

      const settled = await Promise.allSettled(
        targets.map((provider) => provider.search({ query, limit })),
      )

      const results: ProviderSearchResult[] = []
      settled.forEach((outcome, index) => {
        if (outcome.status === 'fulfilled') {
          results.push(...outcome.value)
        } else {
          const provider = targets[index]
          if (provider) failed.push(provider.key)
        }
      })

      // When searching a single type, respect the caller's limit exactly.
      // Across types, interleave so one catalogue cannot crowd out another.
      const filtered = mediaType ? results.filter((r) => r.mediaType === mediaType) : results
      return { results: mediaType ? filtered.slice(0, limit) : interleave(filtered, limit), failed }
    },
  }
}

/**
 * Round-robins results by media type so a query like "dune" returns the book
 * alongside the films instead of ten TMDB rows first.
 */
function interleave(results: ProviderSearchResult[], limit: number): ProviderSearchResult[] {
  const buckets = new Map<MediaType, ProviderSearchResult[]>()
  for (const type of MEDIA_TYPES) buckets.set(type, [])
  for (const result of results) buckets.get(result.mediaType)?.push(result)

  const output: ProviderSearchResult[] = []
  let round = 0
  while (output.length < limit) {
    let added = false
    for (const type of MEDIA_TYPES) {
      const item = buckets.get(type)?.[round]
      if (item) {
        output.push(item)
        added = true
        if (output.length === limit) break
      }
    }
    if (!added) break
    round++
  }
  return output
}
