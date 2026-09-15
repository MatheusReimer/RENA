import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

import { createProviderRegistry, peopleRepository, type ProviderRegistry } from '@revy/core'
import {
  createDatabase,
  embeddedDataDir,
  isEmbedded,
  schema,
  toAbsoluteEmbeddedUrl,
  type Database,
} from '@revy/db'
import type { CreditRole, MediaMetadata, MediaType } from '@revy/shared/types'
import { asc, sql } from 'drizzle-orm'

/**
 * Credits backfill: who made the titles already in the catalogue.
 *
 * Separate from `import.ts` on purpose. The importer builds whole pages of
 * titles from one list request, which is what makes it cheap; credits are one
 * request per *title*, so folding them in would multiply the cost of a normal
 * import by twenty and rate-limit it into the ground. This is the job you run
 * once after adding people, and occasionally afterwards.
 *
 * Run with:   pnpm db:credits
 *             pnpm db:credits -- --limit 200
 *             pnpm db:credits -- --force      (re-fetch titles already done)
 *
 * Idempotent: people upsert on (provider, external_id) and a title's credits
 * are replaced wholesale, so running it twice changes nothing.
 *
 * Two sources, and only one of them costs a request:
 *
 *  - Movies and series go to TMDB, which models people as entities with ids
 *    and photographs.
 *  - Books and games already carry `metadata.authors` and
 *    `metadata.developers` -- plain strings, captured at import, unjoinable.
 *    Those become `people` rows with `provider: 'local'` and a slug of the
 *    name as their id, which is what makes two books by one author resolve to
 *    one person. No network at all.
 */

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

/** How many titles to process in one run, unless told otherwise. */
const DEFAULT_LIMIT = 500

/**
 * Pause between provider requests.
 *
 * TMDB's documented ceiling is far above this, but a previous import learned
 * the hard way that hammering detail endpoints in parallel earns 502s -- and
 * unlike a list request, a failed credits call costs a title its whole cast.
 * This job is not interactive; it can afford to be polite.
 */
const REQUEST_DELAY_MS = 120

function parseFlag(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`)
  if (at === -1) return fallback
  const value = Number(process.argv[at + 1])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A stable local id for somebody we only know by name.
 *
 * Lowercased, stripped of punctuation and collapsed to single hyphens, so
 * "J. R. R. Tolkien" and "J.R.R. Tolkien" land on the same row. Imperfect --
 * two different people with one name become one person, and a name spelled
 * two genuinely different ways stays two. Both are acceptable next to the
 * alternative, which is that book authors have no page at all.
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The metadata key that holds names, per media type. */
const LOCAL_NAME_SOURCE: Partial<Record<MediaType, { key: string; role: CreditRole }>> = {
  book: { key: 'authors', role: 'author' },
  game: { key: 'developers', role: 'developer' },
}

interface Row {
  id: string
  provider: string
  externalId: string
  mediaType: MediaType
  metadata: MediaMetadata
}

/**
 * Credits derived from strings we already hold. Costs nothing.
 *
 * Returns null when this title has no such strings, so the caller can tell
 * "nothing to do" apart from "wrote zero credits".
 */
async function backfillLocal(db: Database, row: Row): Promise<number | null> {
  const source = LOCAL_NAME_SOURCE[row.mediaType]
  if (!source) return null

  const names = row.metadata[source.key]
  if (!Array.isArray(names) || names.length === 0) return null

  const people = names
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .map((name) => name.trim())

  if (people.length === 0) return null

  const ids = await peopleRepository.upsertMany(
    db,
    people.map((name) => ({
      provider: 'local',
      externalId: slugify(name),
      name,
      imageUrl: null,
      metadata: {},
    })),
  )

  const credits = people
    .map((name, index) => {
      const personId = ids.get(`local:${slugify(name)}`)
      return personId ? { personId, role: source.role, character: null, billing: index } : null
    })
    .filter((credit): credit is NonNullable<typeof credit> => credit !== null)

  await peopleRepository.replaceCredits(db, row.id, credits)
  return credits.length
}

/** Credits from the provider. One request per title. */
async function backfillProvider(
  db: Database,
  registry: ProviderRegistry,
  row: Row,
): Promise<number | null> {
  const provider = registry.forType(row.mediaType)
  if (!provider?.getCredits) return null

  // Only ask the provider that owns this row: a title imported from Steam has
  // no TMDB id, and sending one would look up an unrelated film.
  if (provider.key !== row.provider) return null

  const credits = await provider.getCredits(row.externalId, row.mediaType)
  if (credits.length === 0) return 0

  const ids = await peopleRepository.upsertMany(
    db,
    credits.map((credit) => ({
      provider: credit.provider,
      externalId: credit.externalId,
      name: credit.name,
      imageUrl: credit.imageUrl,
      metadata: credit.metadata,
    })),
  )

  const rows = credits
    .map((credit) => {
      const personId = ids.get(`${credit.provider}:${credit.externalId}`)
      return personId
        ? {
            personId,
            role: credit.role,
            character: credit.character,
            billing: credit.billing,
          }
        : null
    })
    .filter((credit): credit is NonNullable<typeof credit> => credit !== null)

  await peopleRepository.replaceCredits(db, row.id, rows)
  return rows.length
}

async function main() {
  const url = toAbsoluteEmbeddedUrl(process.env.DATABASE_URL ?? '', repoRoot)

  if (!url) {
    console.error('\n  DATABASE_URL is not set.\n')
    process.exit(1)
  }

  const limit = parseFlag('limit', DEFAULT_LIMIT)
  const force = process.argv.includes('--force')
  const db = createDatabase({ connectionString: url, maxConnections: 1 })

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

  const all = (await db
    .select({
      id: schema.media.id,
      provider: schema.media.provider,
      externalId: schema.media.externalId,
      mediaType: schema.media.mediaType,
      metadata: schema.media.metadata,
    })
    .from(schema.media)
    // Deterministic, so a run interrupted halfway resumes where it stopped
    // rather than re-rolling the dice on which titles get covered.
    .orderBy(asc(schema.media.id))) as Row[]

  const done = force
    ? new Set<string>()
    : await peopleRepository.mediaWithCredits(
        db,
        all.map((row) => row.id),
      )

  const pending = all.filter((row) => !done.has(row.id)).slice(0, limit)

  console.log(`\n  ${all.length} titles in the catalogue, ${done.size} already have credits.`)
  console.log(`  Processing ${pending.length} (limit ${limit}${force ? ', forced' : ''}).\n`)

  let written = 0
  let covered = 0
  let skipped = 0
  let failed = 0

  for (const [index, row] of pending.entries()) {
    try {
      // Free first: a book's authors are already in hand, and asking a
      // provider about them would be a request that could only lose.
      let count = await backfillLocal(db, row)

      if (count === null) {
        count = await backfillProvider(db, registry, row)
        if (count !== null) await sleep(REQUEST_DELAY_MS)
      }

      if (count === null) skipped++
      else {
        written += count
        if (count > 0) covered++
      }
    } catch (error) {
      // One title's credits are not worth ending the run over. Providers
      // rate-limit and time out, and the next title usually works.
      failed++
      console.log(`\n  ${row.mediaType} ${row.externalId} failed: ${(error as Error).message}`)
    }

    if ((index + 1) % 10 === 0 || index === pending.length - 1) {
      process.stdout.write(`\r  ${index + 1}/${pending.length} titles, ${written} credits...`)
    }
  }

  const [people] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.people)
  const [credits] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.mediaCredits)

  console.log(`\n\n  ${covered} titles credited, ${skipped} had no source, ${failed} failed.`)
  console.log(`  Catalogue now holds ${people?.n ?? 0} people and ${credits?.n ?? 0} credits.\n`)

  process.exit(0)
}

main().catch((error) => {
  console.error('\n  Credits backfill failed:\n', error, '\n')
  process.exit(1)
})
