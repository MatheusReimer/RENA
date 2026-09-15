/**
 * Applies pending migrations, without reseeding anything.
 *
 * `pnpm db:migrate` runs drizzle-kit, which opens its own postgres connection
 * and therefore cannot reach a `pglite://` URL -- which is the default in this
 * repo. So the documented way to apply a migration in development was
 * `pnpm db:seed`, which applies them *and* clears the database first. That is
 * fine on the day you set the project up and wrong every day after it: adding
 * a column meant destroying every account, every rating and every message.
 *
 * This is the migrate half on its own. Idempotent -- drizzle records what it
 * has applied -- and it falls through to advising drizzle-kit when the target
 * is a real Postgres, where that tool works properly.
 *
 * Run with: pnpm db:migrate:dev
 */
import { createDatabase, isEmbedded, toAbsoluteEmbeddedUrl } from '@revy/db'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/migrations', import.meta.url))

async function main() {
  const raw = process.env.DATABASE_URL ?? ''
  if (!raw) {
    console.error('  DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
    process.exit(1)
  }

  if (!isEmbedded(raw)) {
    console.log('  Not an embedded database -- use `pnpm db:migrate`, which handles Postgres.')
    return
  }

  const connectionString = toAbsoluteEmbeddedUrl(raw, repoRoot)
  // One connection, because PGlite allows exactly one: the dev server must be
  // stopped before this runs, and a second connection fails rather than waits.
  const db = createDatabase({ connectionString, maxConnections: 1 })

  const { migrate } = await import('drizzle-orm/pglite/migrator')
  await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR })

  console.log('  Migrations applied.')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
