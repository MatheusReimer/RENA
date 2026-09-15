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
import type { MediaMetadata, MediaType } from '@revy/shared/types'
import { asc, sql } from 'drizzle-orm'

/**
 * Catalogue enrichment: fills in the scores and blurbs the import could not.
 *
 * `metadata.externalRating` is captured once, during import, and then frozen.
 * Two things follow from that, and both were visible on the site:
 *
 *  - A title imported before release has no votes yet, so it is stored with
 *    no score and keeps none forever. Avatar: Fire and Ash was blank nine
 *    months after release while TMDB had 7.6 from four thousand people.
 *  - Books never had one at all. Open Library's search payload carries no
 *    rating; it lives at `/works/{id}/ratings.json`, one request per work,
 *    which is far too expensive during a bulk import and perfectly reasonable
 *    here.
 *
 * Run with:   pnpm db:scores
 *             pnpm db:scores -- --limit 200
 *             pnpm db:scores -- --all       (re-check titles that already have one)
 *
 * Books were missing both, for one reason: Open Library's `/search.json`
 * returns neither a rating nor a description. Each lives on its own endpoint,
 * one request per work -- far too expensive during a bulk import and perfectly
 * reasonable here.
 *
 * Idempotent, and it records `ratingCheckedAt` and `descriptionCheckedAt`
 * separately on every title it asks about. Separate because they are separate
 * questions from separate endpoints: without the markers a title the provider
 * has nothing for is re-fetched on every future run, forever.
 */

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

/** Titles to check in one run, unless told otherwise. */
const DEFAULT_LIMIT = 400

/**
 * Pause between requests.
 *
 * One request per title, and Open Library is visibly rate sensitive -- an
 * earlier import learned that the hard way. This job is not interactive.
 */
const REQUEST_DELAY_MS = 150

function parseFlag(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`)
  if (at === -1) return fallback
  const value = Number(process.argv[at + 1])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

interface Row {
  id: string
  provider: string
  externalId: string
  mediaType: MediaType
  title: string
  description: string | null
  metadata: MediaMetadata
}

async function refresh(
  db: Database,
  registry: ProviderRegistry,
  row: Row,
): Promise<{ score: 'filled' | 'cleared' | 'none' | 'skipped'; blurb: boolean }> {
  const provider = registry.forType(row.mediaType)

  // Only ask the provider that owns this row: a game imported from Steam has
  // no RAWG id, and sending one would look up an unrelated title.
  if (!provider || provider.key !== row.provider) return { score: 'skipped', blurb: false }

  let score: 'filled' | 'cleared' | 'none' | 'skipped' = 'skipped'

  if (provider.getRating && wantsScore(row)) {
    const rating = await provider.getRating(row.externalId, row.mediaType)

    // Written either way. A null still records that we asked, which is what
    // stops the next run asking the same question about the same title.
    await mediaRepository.setExternalRating(db, row.id, rating)
    await sleep(REQUEST_DELAY_MS)

    // Distinguishes "the provider dropped a score it used to have" from "it
    // never had one", which read differently in the summary.
    score = rating ? 'filled' : row.metadata.externalRating ? 'cleared' : 'none'
  }

  /*
   * The blurb, where the row has none and the provider can supply one.
   *
   * Folded into this pass rather than given its own script because it is the
   * same titles, missing for the same reason: Open Library's search payload
   * carries neither a rating nor a description, so books arrived with both
   * blank. A second walk of the catalogue to fetch the other half would be
   * the same work twice.
   */
  let blurb = false

  if (provider.getDescription && wantsBlurb(row)) {
    const description = await provider.getDescription(row.externalId, row.mediaType)
    await mediaRepository.setDescription(db, row.id, description)
    await sleep(REQUEST_DELAY_MS)
    blurb = description !== null
  }

  return { score, blurb }
}

/** A score is worth asking for when there is none and we have not asked. */
function wantsScore(row: Row): boolean {
  return !row.metadata.externalRating && !row.metadata.ratingCheckedAt
}

/** Likewise for the blurb, tracked separately -- a different endpoint. */
function wantsBlurb(row: Row): boolean {
  const empty = !row.description || row.description.trim().length === 0
  return empty && !row.metadata.descriptionCheckedAt
}

async function main() {
  const url = toAbsoluteEmbeddedUrl(process.env.DATABASE_URL ?? '', repoRoot)

  if (!url) {
    console.error('\n  DATABASE_URL is not set.\n')
    process.exit(1)
  }

  const limit = parseFlag('limit', DEFAULT_LIMIT)
  const all = process.argv.includes('--all')
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

  const rows = (await db
    .select({
      id: schema.media.id,
      provider: schema.media.provider,
      externalId: schema.media.externalId,
      mediaType: schema.media.mediaType,
      title: schema.media.title,
      description: schema.media.description,
      metadata: schema.media.metadata,
    })
    .from(schema.media)
    // Deterministic, so a run interrupted halfway resumes where it stopped.
    .orderBy(asc(schema.media.id))) as Row[]

  /*
   * What is worth asking about.
   *
   * A title with no score that this job has not already asked about, or --
   * with --all -- everything, which is how you refresh scores that have simply
   * moved since import.
   *
   * `metadata.ratingCheckedAt` is the marker, not `synced_at`: the importer
   * stamps `synced_at` on every upsert, so it says when we last *saw* the row
   * rather than when we last asked about its score. The first version of this
   * filtered on it and selected zero titles, because every row in a catalogue
   * built by the importer already has one.
   */
  const pending = rows.filter((row) => all || wantsScore(row) || wantsBlurb(row)).slice(0, limit)

  const noScore = rows.filter((row) => !row.metadata.externalRating).length
  const noBlurb = rows.filter((row) => !row.description?.trim()).length

  console.log(`\n  ${rows.length} titles: ${noScore} with no score, ${noBlurb} with no blurb.`)
  console.log(`  Checking ${pending.length} (limit ${limit}${all ? ', all' : ''}).\n`)

  let filled = 0
  let blurbs = 0
  let none = 0
  let cleared = 0
  let skipped = 0
  let failed = 0

  for (const [index, row] of pending.entries()) {
    try {
      const outcome = await refresh(db, registry, row)
      if (outcome.score === 'filled') filled++
      else if (outcome.score === 'cleared') cleared++
      else if (outcome.score === 'none') none++
      else skipped++
      if (outcome.blurb) blurbs++
    } catch (error) {
      // One title is not worth ending the run over; providers rate-limit and
      // time out, and the next title usually works.
      failed++
      console.log(`\n  ${row.title.slice(0, 40)} failed: ${(error as Error).message}`)
    }

    if ((index + 1) % 10 === 0 || index === pending.length - 1) {
      process.stdout.write(
        `\r  ${index + 1}/${pending.length} checked, ${filled} scores, ${blurbs} blurbs...`,
      )
    }
  }

  const [after] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.media)
    .where(sql`${schema.media.metadata} -> 'externalRating' IS NULL`)

  console.log(
    `\n\n  ${filled} scores filled, ${blurbs} descriptions filled, ${none} genuinely` +
      ` unrated, ${cleared} cleared, ${skipped} nothing to ask, ${failed} failed.`,
  )
  console.log(`  ${after?.n ?? 0} titles still have no provider score.\n`)

  process.exit(0)
}

main().catch((error) => {
  console.error('\n  Score refresh failed:\n', error, '\n')
  process.exit(1)
})
