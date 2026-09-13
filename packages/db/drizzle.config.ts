import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

/**
 * `drizzle-kit generate` diffs the schema against the migration history and
 * needs no database, so a placeholder keeps migration authoring possible
 * before anyone has provisioned Postgres. `migrate` / `push` / `studio` do
 * connect, and will fail loudly against the placeholder -- which is the
 * correct outcome, not a silent write to the wrong database.
 */
const PLACEHOLDER = 'postgresql://placeholder:placeholder@localhost:5432/placeholder'

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? PLACEHOLDER },
  verbose: true,
  strict: true,
})
