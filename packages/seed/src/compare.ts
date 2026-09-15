/**
 * Runs one described request through every configured provider, side by side.
 *
 * This is the honest version of "which model should we use". An online A/B
 * split would need a success metric and enough traffic to reach significance,
 * and this product has neither yet -- so the fastest route to an answer is to
 * ask all of them the same thing and read the replies yourself. Ten minutes
 * here beats six weeks of an experiment that never reaches a conclusion.
 *
 * It bypasses the chain deliberately: the chain exists to hide a failing
 * provider, which is exactly what you do not want when comparing them.
 *
 * Run with:
 *   pnpm ai:compare "a World War II film that isn't a documentary"
 *
 * Lives in the seed package because that is where the dev tooling with a tsx
 * runner and every workspace dependency already is. It is not a seed concern,
 * and if a third script like this appears they should move out together.
 */
import {
  createCerebrasRecommender,
  createClaudeRecommender,
  createGeminiRecommender,
  createGroqRecommender,
  CANDIDATES_PER_TYPE,
  discoveryCandidates,
  type DiscoveryCandidate,
  type Recommender,
} from '@revy/core'
import { createDatabase, toAbsoluteEmbeddedUrl } from '@revy/db'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

const request = process.argv.slice(2).join(' ').trim()
if (!request) {
  console.error('\n  Usage: pnpm ai:compare "what you are in the mood for"\n')
  process.exit(1)
}

/** Same candidate set for everyone: a different catalogue is a different question. */
const db = createDatabase({
  connectionString: toAbsoluteEmbeddedUrl(process.env.DATABASE_URL ?? '', repoRoot),
  maxConnections: 1,
})

function configured(): Array<{ name: string; recommender: Recommender }> {
  const entries: Array<{ name: string; recommender: Recommender }> = []

  if (process.env.GEMINI_API_KEY) {
    entries.push({
      name: 'gemini',
      recommender: createGeminiRecommender({
        apiKey: process.env.GEMINI_API_KEY,
        ...(process.env.GEMINI_MODEL ? { model: process.env.GEMINI_MODEL } : {}),
      }),
    })
  }
  if (process.env.CEREBRAS_API_KEY) {
    entries.push({
      name: 'cerebras',
      recommender: createCerebrasRecommender(
        process.env.CEREBRAS_API_KEY,
        process.env.CEREBRAS_MODEL || undefined,
      ),
    })
  }
  if (process.env.GROQ_API_KEY) {
    entries.push({
      name: 'groq',
      recommender: createGroqRecommender(
        process.env.GROQ_API_KEY,
        process.env.GROQ_MODEL || undefined,
      ),
    })
  }
  if (process.env.ANTHROPIC_API_KEY) {
    entries.push({
      name: 'claude',
      recommender: createClaudeRecommender(process.env.ANTHROPIC_API_KEY),
    })
  }

  return entries
}

async function main() {
  const providers = configured()
  if (providers.length === 0) {
    console.error('\n  No provider keys are set. See .env.example.\n')
    process.exit(1)
  }

  // The same slice the app sends, so the comparison measures the model
  // rather than a prompt size nothing else uses.
  const rows = await discoveryCandidates(db, { perType: CANDIDATES_PER_TYPE })
  const candidates: DiscoveryCandidate[] = rows.map((row, index) => ({
    ref: index + 1,
    mediaType: row.mediaType,
    title: row.title,
    year: row.releaseDate ? new Date(row.releaseDate).getFullYear() : null,
    authors: [],
    genres: [],
    ratingAverage: null,
    ratingCount: 0,
    externalRating: null,
  }))

  console.log(`\n  "${request}"`)
  console.log(`  ${candidates.length} candidates · ${providers.map((p) => p.name).join(', ')}\n`)

  /*
   * Sequential, not parallel.
   *
   * Free tiers are rate limited per minute, and firing four heavy requests at
   * once is the reliable way to make several of them fail for reasons that
   * have nothing to do with the thing being measured.
   */
  for (const { name, recommender } of providers) {
    const started = Date.now()
    try {
      const answer = await recommender.discover({
        request,
        candidates,
        locale: 'en',
        limit: 8,
        answers: [],
        // Asking is allowed, because whether a model narrows a vague request
        // or guesses at it is one of the things worth comparing.
        canAskQuestion: true,
      })

      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      console.log(`  ── ${name} (${seconds}s) ${'─'.repeat(Math.max(0, 46 - name.length))}`)
      console.log(`     understood: ${answer.understood}`)

      if (answer.question) {
        console.log(`     ASKS [${answer.question.dimension}]: ${answer.question.question}`)
        for (const option of answer.question.options) console.log(`       · ${option}`)
      } else if (answer.picks.length === 0) {
        console.log(`     no picks. ${answer.nothingFits ?? ''}`)
      } else {
        for (const pick of answer.picks) {
          const title = candidates.find((c) => c.ref === pick.ref)?.title ?? `?? ref ${pick.ref}`
          console.log(`       ${title} — ${pick.because}`)
        }
      }
      console.log()
    } catch (error) {
      const seconds = ((Date.now() - started) / 1000).toFixed(1)
      const message = error instanceof Error ? error.message : String(error)
      console.log(`  ── ${name} (${seconds}s) FAILED: ${message}\n`)
    }
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
