/**
 * Syncs the badge catalogue into the database, without touching anything else.
 *
 * `syncCatalogue` was only ever called from the full seed, which clears the
 * database first -- so renaming a badge or adding one meant destroying every
 * account to publish a string change. That is fine on a laptop and impossible
 * on anything with users, and it is the reason the catalogue had not been
 * touched since it was written.
 *
 * This is the same call on its own. It upserts by slug, so it is idempotent,
 * safe to run against production, and safe to run twice. Earned badges are
 * rows in `user_badges` keyed by badge id, so a rename reaches everybody who
 * already has one rather than orphaning them.
 *
 * Run with: pnpm db:badges
 */
import { badgeService } from '@revy/core'
import { createDatabase, schema, toAbsoluteEmbeddedUrl } from '@revy/db'
import { sql } from 'drizzle-orm'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const db = createDatabase({
  connectionString: toAbsoluteEmbeddedUrl(process.env.DATABASE_URL ?? '', repoRoot),
  maxConnections: 1,
})

async function main() {
  await badgeService.syncCatalogue(db)

  /*
   * Backfill the displayed title for anyone who earned badges before the
   * column existed.
   *
   * Idempotent and safe to repeat: it recomputes each user's rarest badge from
   * `user_badges` and writes it, so it also repairs a title that drifted -- a
   * badge retiered in the definitions, say. `badgeService` keeps it current
   * from here on.
   */
  const titled = await db.execute(sql`
    UPDATE ${schema.users} u
    SET title_badge_slug = best.slug
    FROM (
      SELECT ub.user_id, b.slug,
             ROW_NUMBER() OVER (
               PARTITION BY ub.user_id ORDER BY b.tier DESC, ub.earned_at DESC
             ) AS rank
      FROM ${schema.userBadges} ub
      JOIN ${schema.badges} b ON b.id = ub.badge_id
    ) AS best
    WHERE best.user_id = u.id
      AND best.rank = 1
      AND (u.title_badge_slug IS DISTINCT FROM best.slug)
  `)
  void titled

  const rows = await db
    .select({ slug: schema.badges.slug, name: schema.badges.name })
    .from(schema.badges)
    .orderBy(schema.badges.slug)

  console.log(`\n  ${rows.length} badges in the catalogue:\n`)
  for (const row of rows) console.log(`    ${row.slug.padEnd(20)} ${row.name}`)
  console.log()

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
