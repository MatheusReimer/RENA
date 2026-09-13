import { getDatabase, type Database } from '@revy/db'

/**
 * The process-wide database handle.
 *
 * Read from runtime config rather than `process.env` directly so the value can
 * be supplied by the platform at boot (Vercel, Azure) without a rebuild.
 */
let warned = false

export function useDatabase(): Database {
  const config = useRuntimeConfig()
  const connectionString = config.databaseUrl

  if (!connectionString) {
    // A missing DATABASE_URL is a setup mistake, not a runtime condition, so
    // say so clearly once rather than failing with a driver error per request.
    if (!warned) {
      warned = true
      console.error(
        '[revy] DATABASE_URL is not set. Copy .env.example to .env and fill it in.',
      )
    }
    throw createError({
      statusCode: 503,
      data: {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'The service is not configured correctly.',
        },
      },
    })
  }

  return getDatabase({
    connectionString,
    logQueries: config.logQueries === 'true',
  })
}
