import { createRecommender, createTranslator, type Recommender, type Translator } from '@revy/core'

/**
 * The recommender, built once per process (SPEC 40).
 *
 * A singleton for the same reason the provider registry is one: the client
 * holds a connection pool and a fresh one per request would open a socket
 * every time somebody asks a question.
 *
 * Deliberately not part of `ServiceContext`. That context is the domain's, and
 * every service in `packages/core` takes it -- adding a paid external client to
 * it would mean every unrelated service test has to know this exists. The one
 * service that needs a recommender is handed one.
 */
let instance: Recommender | null = null

export function useRecommender(): Recommender {
  if (instance) return instance

  const config = useRuntimeConfig()
  instance = createRecommender({
    anthropicApiKey: config.anthropicApiKey || undefined,
    geminiApiKey: config.geminiApiKey || undefined,
    geminiModel: config.geminiModel || undefined,
    cerebrasApiKey: config.cerebrasApiKey || undefined,
    cerebrasModel: config.cerebrasModel || undefined,
    groqApiKey: config.groqApiKey || undefined,
    groqModel: config.groqModel || undefined,
  })

  // Which providers are actually in play, once per process. Worth a line: the
  // difference between "Gemini is slow today" and "we have been running on the
  // fallback for a week" is invisible without it.
  console.info(`[revy] recommender: ${instance.kind}`)

  return instance
}

/**
 * The translator, built once per process (SPEC 31).
 *
 * Shares the Gemini key with the recommender but not the client: they use
 * different models for different jobs, and one of them being at capacity
 * should not affect the other.
 */
let translator: Translator | null = null

export function useTranslator(): Translator {
  if (translator) return translator

  const config = useRuntimeConfig()
  translator = createTranslator({ geminiApiKey: config.geminiApiKey || undefined })

  return translator
}
