import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

import {
  createProviderRegistry,
  mediaTranslationRepository,
  type ProviderRegistry,
} from '@revy/core'
import {
  createDatabase,
  embeddedDataDir,
  isEmbedded,
  schema,
  toAbsoluteEmbeddedUrl,
  type Database,
} from '@revy/db'
import type { MediaType } from '@revy/shared/types'
import { asc, sql } from 'drizzle-orm'

/**
 * Catalogue translations: titles and plot summaries in the interface's
 * languages.
 *
 * A Portuguese reader was getting a Portuguese sidebar over "The Dark Knight"
 * and an English plot summary, which is most of the way to not being
 * translated at all.
 *
 * The text comes from the provider, not from a translator, and the difference
 * is not a detail. TMDB returns "Batman: O Cavaleiro das Trevas" for pt-BR --
 * the film's actual Brazilian release title, and what somebody would search
 * for. A model given "The Dark Knight" produces "O Cavaleiro Escuro", which is
 * a correct translation of a name nobody uses.
 *
 * Run with:   pnpm db:translate
 *             pnpm db:translate -- --limit 200
 *             pnpm db:translate -- --all     (re-fetch titles already done)
 *
 * One request per title returns every language TMDB has, so adding a fourth
 * interface language later costs another run of this, not another API budget.
 *
 * Books and games have no such source -- Open Library and RAWG are
 * English-only -- so those are left alone here. Machine-translating them is a
 * separate decision with a separate quality bar, and mixing the two under one
 * command would hide which text is which.
 */

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))

const DEFAULT_LIMIT = 400

/** One request per title; TMDB tolerates far more than this. */
const REQUEST_DELAY_MS = 120

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
}

async function translate(
  db: Database,
  registry: ProviderRegistry,
  row: Row,
): Promise<number> {
  const provider = registry.forType(row.mediaType)
  if (!provider?.getTranslations) return -1

  // Only ask the provider that owns this row.
  if (provider.key !== row.provider) return -1

  const translations = await provider.getTranslations(row.externalId, row.mediaType)

  await mediaTranslationRepository.upsertMany(
    db,
    row.id,
    translations.map((entry) => ({
      language: entry.language,
      title: entry.title,
      description: entry.description,
      source: provider.key,
    })),
  )

  return translations.length
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
    })
    .from(schema.media)
    // Deterministic, so a run interrupted halfway resumes where it stopped.
    .orderBy(asc(schema.media.id))) as Row[]

  // Only the types a provider can actually answer for. Walking books and games
  // would spend the whole limit on titles that return nothing.
  const eligible = rows.filter((row) => row.mediaType === 'movie' || row.mediaType === 'series')

  const done = all
    ? new Set<string>()
    : await mediaTranslationRepository.translated(
        db,
        eligible.map((row) => row.id),
      )

  const pending = eligible.filter((row) => !done.has(row.id)).slice(0, limit)

  console.log(`\n  ${eligible.length} films and series, ${done.size} already translated.`)
  console.log(`  Fetching ${pending.length} (limit ${limit}${all ? ', all' : ''}).\n`)

  let translated = 0
  let empty = 0
  let skipped = 0
  let failed = 0

  for (const [index, row] of pending.entries()) {
    try {
      const count = await translate(db, registry, row)

      if (count < 0) skipped++
      else if (count === 0) empty++
      else translated++

      if (count >= 0) await sleep(REQUEST_DELAY_MS)
    } catch (error) {
      // One title is not worth ending the run over.
      failed++
      console.log(`\n  ${row.title.slice(0, 40)} failed: ${(error as Error).message}`)
    }

    if ((index + 1) % 10 === 0 || index === pending.length - 1) {
      process.stdout.write(`\r  ${index + 1}/${pending.length} checked, ${translated} translated...`)
    }
  }

  const [total] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.mediaTranslations)

  const byLanguage = await db
    .select({
      language: schema.mediaTranslations.language,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.mediaTranslations)
    .groupBy(schema.mediaTranslations.language)

  console.log(
    `\n\n  ${translated} translated, ${empty} had none, ${skipped} no provider, ${failed} failed.`,
  )
  console.log(`  ${total?.n ?? 0} translation rows:`)
  for (const row of byLanguage) console.log(`    ${row.language.padEnd(7)} ${row.n}`)
  console.log('')

  process.exit(0)
}

main().catch((error) => {
  console.error('\n  Translation backfill failed:\n', error, '\n')
  process.exit(1)
})
