import { drizzle } from 'drizzle-orm/postgres-js'
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
 */

export type Database = ReturnType<typeof createDatabase>

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

export function createDatabase(options: DatabaseOptions) {
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

/**
 * Process-wide singleton.
 *
 * Nitro re-imports modules per request in dev; without caching this would open
 * a new pool on every hot reload and exhaust the connection limit.
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
