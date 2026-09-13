import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle } from 'drizzle-orm/postgres-js'
import { mkdirSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * Database client.
 *
 * postgres-js over a standard connection string, rather than a Neon-specific
 * driver: it supports real transactions (which the neon-http driver does not,
 * and which rating + activity + XP writes need to be atomic), and it works
 * unchanged against Neon, a local Postgres, or Azure Database for PostgreSQL.
 * Moving providers is a connection-string change.
 *
 * A `pglite:` connection string selects an embedded Postgres instead -- see
 * `isEmbedded` below.
 */

export type Database = ReturnType<typeof createPostgresDatabase>

/**
 * A transaction handle, structurally identical to `Database` for query
 * purposes. Derived from Drizzle's own callback signature so it tracks the
 * driver rather than being hand-maintained.
 */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * Anything that can run a query.
 *
 * Repositories accept this rather than `Database`, so the same method works
 * standalone or inside a transaction. Without it, every multi-write operation
 * (rate -> activity -> XP -> badge) would need a duplicate "…InTx" method.
 */
export type Executor = Database | Transaction

let cached: Database | null = null

export interface DatabaseOptions {
  connectionString: string
  /**
   * Serverless invocations should hold one connection each; a long-running
   * server can pool. Defaults to a small pool that is safe in both.
   */
  maxConnections?: number
  logQueries?: boolean
}

/**
 * True when the connection string asks for the embedded database.
 *
 * `pglite:` runs Postgres compiled to WebAssembly inside the Node process --
 * no server, no Docker, no install. It exists so a fresh clone can run the
 * app and the seed immediately, before anyone has provisioned Neon.
 *
 * It is a development convenience only. PGlite is single-connection and
 * single-process, so it cannot serve concurrent users: production always uses
 * a real Postgres over postgres-js.
 */
export function isEmbedded(connectionString: string): boolean {
  return connectionString.startsWith('pglite:')
}

/**
 * Filesystem path an embedded connection string points at.
 *
 * Relative paths resolve against the current working directory, which differs
 * per entry point -- so callers should hand this an absolute path. Use
 * `toAbsoluteEmbeddedUrl` at the edge (nuxt.config, the seed) where the
 * repository root is actually known.
 *
 * Deliberately does NOT derive the root from `import.meta.url`: this module is
 * inlined into the Nitro bundle, where that points at the bundle rather than
 * at `packages/db/src`. An earlier version did exactly that and silently
 * created a second, empty database next to the real one.
 */
export function embeddedDataDir(connectionString: string): string {
  const raw = connectionString.replace(/^pglite:(\/\/)?/, '').trim()
  const path = raw.length > 0 ? raw : '.data/revy'

  return isAbsolute(path) ? path : resolve(process.cwd(), path)
}

/**
 * Rewrites an embedded connection string to carry an absolute path.
 *
 * Called from entry points that know where the repository root is, so every
 * process -- the seed, the dev server, the built server -- opens the same
 * data directory regardless of its working directory. Non-embedded
 * connection strings pass through untouched.
 */
export function toAbsoluteEmbeddedUrl(connectionString: string, rootDir: string): string {
  if (!isEmbedded(connectionString)) return connectionString

  const raw = connectionString.replace(/^pglite:(\/\/)?/, '').trim()
  const path = raw.length > 0 ? raw : '.data/revy'

  return `pglite://${isAbsolute(path) ? path : resolve(rootDir, path)}`
}

function createPostgresDatabase(options: DatabaseOptions) {
  const client = postgres(options.connectionString, {
    max: options.maxConnections ?? 5,
    // Neon and most managed Postgres require TLS; `prepare: false` is needed
    // when connecting through a transaction-mode pooler (Neon's -pooler host,
    // PgBouncer), where prepared statements are not supported.
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  return drizzle(client, {
    schema,
    logger: options.logQueries ?? false,
  })
}

function createEmbeddedDatabase(options: DatabaseOptions): Database {
  const dataDir = embeddedDataDir(options.connectionString)

  // PGlite creates its own data directory but does not create parents, so a
  // nested path like `.data/revy` fails on a fresh clone unless we get there
  // first.
  mkdirSync(dataDir, { recursive: true })

  const client = new PGlite(dataDir)

  /**
   * Cast to the postgres-js database type.
   *
   * Both drivers produce a `PgDatabase` with an identical query API over the
   * same schema; only the session type differs, which is why TypeScript will
   * not equate them. Declaring `Database` as the production driver keeps the
   * repositories honest about what they are written against, and confines the
   * embedded driver's difference to this one line.
   */
  return drizzlePglite(client, {
    schema,
    logger: options.logQueries ?? false,
  }) as unknown as Database
}

export function createDatabase(options: DatabaseOptions): Database {
  return isEmbedded(options.connectionString)
    ? createEmbeddedDatabase(options)
    : createPostgresDatabase(options)
}

/**
 * Process-wide singleton.
 *
 * Nitro re-imports modules per request in dev; without caching this would open
 * a new pool on every hot reload and exhaust the connection limit. For the
 * embedded driver it matters more still -- PGlite allows exactly one handle
 * on a data directory.
 */
export function getDatabase(options: DatabaseOptions): Database {
  if (!cached) {
    cached = createDatabase(options)
  }
  return cached
}

/** Test hook: drops the cached client so a fresh one is built next call. */
export function resetDatabaseCache(): void {
  cached = null
}
