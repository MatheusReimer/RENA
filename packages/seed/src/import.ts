import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

import { createProviderRegistry, mediaRepository, type ProviderRegistry } from '@revy/core'
import {
  createDatabase,
  embeddedDataDir,
  isEmbedded,
  schema,
  toAbsoluteEmbeddedUrl,
  type Database,
} from '@revy/db'
import { MEDIA_TYPES } from '@revy/shared/constants'
import type { MediaType } from '@revy/shared/types'
import { sql } from 'drizzle-orm'

/**
 * Bulk catalogue import (SPEC 8).
 *
 * The seed produces a handful of titles so every screen has something on it.
 * That is a demo, not a catalogue -- browsing needs hundreds of rows, and they
 * have to come from the providers rather than from a fixtures file.
 *
 * Run with:   pnpm db:import
 *             pnpm db:import -- --pages 20
 *
 * Additive and idempotent: it upserts on (provider, external_id, media_type),
 * so running it again refreshes rather than duplicates, and it never touches
 * ratings, reviews or anything a person created.
 */

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

/** Pages per media type. TMDB returns 20 per page, Open Library 50. */
const DEFAULT_PAGES = 12

/**
 * Pause between requests.
 *
 * TMDB tolerates far more than this, but Open Library is visibly rate
 * sensitive and Steam's storefront is undocumented -- being a good citizen
 * costs a few seconds on a job that runs occasionally.
 */
const REQUEST_DELAY_MS = 250

function parsePages(): number {
  const flag = process.argv.indexOf('--pages')
  if (flag === -1) return DEFAULT_PAGES
  const value = Number(process.argv[flag + 1])
  return Number.isInteger(value) && value > 0 ? Math.min(value, 100) : DEFAULT_PAGES
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function importType(
  db: Database,
  registry: ProviderRegistry,
  mediaType: MediaType,
  pages: number,
): Promise<{ imported: number; provider: string | null }> {
  const provider = registry.forType(mediaType)

  if (!provider) {
    console.log(`  ${mediaType.padEnd(7)} no provider configured - skipped`)
    return { imported: 0, provider: null }
  }

  /*
   * A provider that cannot bulk list is a configuration failure, not a note.
   *
   * This line used to read like the others and scrolled past with them. It
   * was hiding the worst outcome the import has: the registry prefers a
   * configured provider over the keyless fallback, so adding an API key --
   * the thing you do to get a *better* catalogue -- could leave you with an
   * empty one, reported in the same grey tone as a success.
   *
   * It now says what happened, what it cost, and what to do about it.
   */
  if (!provider.listPopular) {
    console.error(
      `\n  ${mediaType}: ${provider.key} is configured but cannot bulk list, so nothing was` +
        ' imported.\n  Unset its credentials to fall back to a provider that can, or give' +
        ` ${provider.key} a listPopular implementation.\n`,
    )
    return { imported: 0, provider: provider.key }
  }

  let imported = 0
  let emptyPages = 0

  for (let page = 1; page <= pages; page++) {
    let batch
    try {
      batch = await provider.listPopular(mediaType, page)
    } catch (error) {
      // One bad page should not end the import. Providers rate-limit and time
      // out; the next page usually works, and a partial catalogue beats none.
      console.log(
        `  ${mediaType.padEnd(7)} page ${page} failed (${(error as Error).message}) - continuing`,
      )
      await sleep(REQUEST_DELAY_MS * 4)
      continue
    }

    if (batch.length === 0) {
      // Two empty pages in a row means the catalogue is exhausted for this
      // type; one might just be a gap in a subject sweep.
      if (++emptyPages >= 2) break
      continue
    }
    emptyPages = 0

    for (const item of batch) {
      await mediaRepository.upsertFromProvider(db, item)
      imported++
    }

    process.stdout.write(`\r  ${mediaType.padEnd(7)} ${imported} titles...`)
    await sleep(REQUEST_DELAY_MS)
  }

  process.stdout.write(
    `\r  ${mediaType.padEnd(7)} ${String(imported).padEnd(6)} from ${provider.key}\n`,
  )
  return { imported, provider: provider.key }
}

async function main() {
  const url = toAbsoluteEmbeddedUrl(process.env.DATABASE_URL ?? '', repoRoot)

  if (!url) {
    console.error('\n  DATABASE_URL is not set.\n')
    process.exit(1)
  }

  const pages = parsePages()
  const db = createDatabase({ connectionString: url, maxConnections: 1 })

  // The import runs before the seed now, so it is the first thing to touch a
  // fresh database and has to be able to create the schema. drizzle-kit cannot
  // reach the embedded database -- it opens its own connection and PGlite
  // allows exactly one -- so migrations are applied programmatically.
  if (isEmbedded(url)) {
    console.log(`\n  Embedded Postgres at ${embeddedDataDir(url)} - applying migrations`)
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db as never, {
      migrationsFolder: fileURLToPath(new URL('../../db/migrations', import.meta.url)),
    })
  }

  const registry = createProviderRegistry({
    tmdbApiKey: process.env.TMDB_API_KEY || undefined,
    rawgApiKey: process.env.RAWG_API_KEY || undefined,
    igdbClientId: process.env.IGDB_CLIENT_ID || undefined,
    igdbClientSecret: process.env.IGDB_CLIENT_SECRET || undefined,
  })

  const [before] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(schema.media)

  console.log(`\n  Importing up to ${pages} pages per type.`)
  console.log(`  Catalogue currently holds ${before?.total ?? 0} titles.\n`)

  let total = 0
  for (const mediaType of MEDIA_TYPES) {
    const result = await importType(db, registry, mediaType, pages)
    total += result.imported
  }

  const [after] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.media)

  const byType = await db
    .select({ t: schema.media.mediaType, n: sql<number>`count(*)::int` })
    .from(schema.media)
    .groupBy(schema.media.mediaType)

  console.log(`\n  ${total} rows upserted.`)
  console.log(`  Catalogue now holds ${after?.total ?? 0} titles:`)
  for (const row of byType) {
    console.log(`    ${String(row.t).padEnd(7)} ${row.n}`)
  }
  console.log('')

  process.exit(0)
}

main().catch((error) => {
  console.error('\n  Import failed:\n', error, '\n')
  process.exit(1)
})
