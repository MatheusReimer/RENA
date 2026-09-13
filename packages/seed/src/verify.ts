/**
 * Aggregate consistency check.
 *
 * `media_rating_stats` is denormalised, so it can silently drift from the
 * ratings it summarises -- and a wrong average is the kind of bug nobody
 * reports because nobody can tell. This asserts every row still agrees with a
 * live COUNT/SUM, and that the histogram sums to the same total.
 *
 * Run with: pnpm db:verify
 */
import { createDatabase, schema, toAbsoluteEmbeddedUrl } from '@revy/db'
import { sql } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'

import { config as loadEnv } from 'dotenv'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const db = createDatabase({
  connectionString: toAbsoluteEmbeddedUrl(process.env.DATABASE_URL ?? '', repoRoot),
})

// Every aggregate row must agree with a live COUNT/SUM over ratings, and the
// histogram must sum to the same count.
const rows = await db.execute(sql`
  SELECT
    s.media_id,
    s.rating_count,
    s.rating_sum,
    (SELECT count(*)::int FROM ratings r WHERE r.media_id = s.media_id) AS real_count,
    (SELECT coalesce(sum(r.score),0)::int FROM ratings r WHERE r.media_id = s.media_id) AS real_sum,
    (SELECT coalesce(sum(v::int),0)::int FROM jsonb_each_text(s.distribution) AS e(k,v)) AS hist_total
  FROM media_rating_stats s
`)

// postgres-js returns an array; the pglite driver returns { rows }.
const raw = rows as unknown as { rows?: unknown[] } | unknown[]
const list = (Array.isArray(raw) ? raw : (raw.rows ?? [])) as Array<Record<string, number>>
const bad = list.filter(
  (r) =>
    r.rating_count !== r.real_count ||
    r.rating_sum !== r.real_sum ||
    r.hist_total !== r.real_count,
)

console.log(`  ${list.length} aggregate rows checked`)
console.log(bad.length === 0 ? '  all consistent' : `  ${bad.length} INCONSISTENT`)
if (bad.length) console.log(JSON.stringify(bad.slice(0, 3), null, 2))

const totals = await db.select({ n: sql<number>`count(*)::int` }).from(schema.ratings)
console.log(`  ${totals[0]!.n} ratings total`)
process.exit(bad.length === 0 ? 0 : 1)
