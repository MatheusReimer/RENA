import { DomainError } from '@revy/shared/utils'
import { z } from 'zod'
import {
  CATALOGUE_HEADING,
  SYSTEM_INSTRUCTIONS,
  answerSchema,
  closedDimensions,
  refinementDirective,
  renderCatalogue,
  renderRequest,
  type DiscoveryRequest,
  type Recommender,
  type RecommenderAnswer,
} from './index'

/**
 * Any provider that speaks OpenAI's chat-completions shape (SPEC 40).
 *
 * One transport rather than one per vendor. Groq and Cerebras differ only in a
 * base URL and a model name -- writing `groq.ts` and `cerebras.ts` would be two
 * near-identical files, and the second one to be edited would be the one that
 * quietly falls behind. Anything else with the same endpoint shape (Together,
 * Fireworks, a local vLLM) is a call to this with different arguments.
 *
 * Everything that decides *what a good answer is* -- the instructions, the
 * catalogue rendering, the answer shape, the grounding -- is shared with the
 * other transports and imported from beside this file. Only the HTTP differs.
 *
 * ---
 *
 * Worth knowing about these providers specifically, because it is a real
 * tradeoff rather than a detail: their free tiers run open-weight models, and
 * those know noticeably less about specific films, novels and games than the
 * hosted frontier models do. This whole feature rests on the model knowing
 * what these works *are* -- see the note in `./index.ts`. So these are a good
 * answer to "Gemini is contended right now" and a poor answer to "which model
 * should we build on".
 */

/** Uses `fetch` rather than a vendor SDK: two providers, one endpoint, no dependency. */
export interface OpenAICompatibleOptions {
  apiKey: string
  /** Origin plus path prefix, e.g. https://api.groq.com/openai/v1 */
  baseUrl: string
  model: string
  /** What to call this in logs. */
  kind: string
  /** Defaults to 30s. These providers are fast when they answer at all. */
  timeoutMs?: number
  /** Injected by tests so the request body can be inspected without a key. */
  fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * The response shape, validated before anything is read out of it.
 *
 * Only the one field is described: everything else these APIs return is
 * metadata we do not use, and a schema that insisted on all of it would break
 * on the first provider that spells `usage` differently.
 */
const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
})

export function createOpenAICompatibleRecommender(
  options: OpenAICompatibleOptions,
): Recommender {
  const doFetch = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    available: true,
    kind: options.kind,

    async discover(input: DiscoveryRequest): Promise<RecommenderAnswer> {
      const { request, candidates, locale, limit, answers, canAskQuestion, taste } = input

      /*
       * The catalogue sits in the system message, the reader's words in the
       * user message. Same boundary the other two transports keep: whatever
       * their sentence says, it arrives as something being described rather
       * than as an instruction carrying our authority.
       */
      const system =
        SYSTEM_INSTRUCTIONS +
        CATALOGUE_HEADING +
        renderCatalogue(candidates) +
        `\n\nReturn at most ${limit} picks. Write "understood", "question", every option, ` +
        `every "because" and "nothingFits" in this language: ${locale}.\n\n` +
        refinementDirective(canAskQuestion, closedDimensions(answers))

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      let response: Response
      try {
        response = await doFetch(`${options.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: options.model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: renderRequest(request, answers, taste) },
            ],
            /*
             * Schema-constrained output, not "please reply with JSON".
             *
             * `strict` is deliberately false. Strict mode demands every
             * property be required with `additionalProperties: false`
             * throughout, and support for it across these providers is
             * uneven -- a provider that rejects the request outright is worse
             * than one that occasionally returns a stray field, because the
             * zod parse below catches the second and nothing catches the
             * first.
             */
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'recommendation',
                strict: false,
                schema: jsonSchema(),
              },
            },
            /*
             * Low, for the same reason as the other transports: there is a
             * right answer to "which of these titles fits what they said",
             * and sampling variety reads as unreliability rather than
             * creativity.
             */
            temperature: 0.3,
          }),
        })
      } catch (error) {
        clearTimeout(timer)
        // An abort is this provider being slow, which the chain above can
        // route around; anything else is the network.
        if (error instanceof Error && error.name === 'AbortError') {
          console.error(`[revy] ${options.kind} timed out`)
          throw new DomainError('PROVIDER_UNAVAILABLE', 'That took too long to come back.')
        }
        console.error(`[revy] ${options.kind} unreachable`, error)
        throw new DomainError('PROVIDER_UNAVAILABLE', 'Recommendations could not be reached.')
      }

      clearTimeout(timer)

      if (!response.ok) throw toDomainFailure(options.kind, response.status)

      const body = completionSchema.safeParse(await response.json().catch(() => null))
      if (!body.success) {
        console.error(`[revy] ${options.kind} returned an unreadable envelope`)
        throw new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
      }

      const text = body.data.choices[0]?.message.content
      if (!text) {
        // Empty content is usually a refusal or a truncated generation. Either
        // way there is nothing to ground, and a blank result would read to the
        // reader as "we have nothing for you" rather than as a failure.
        console.error(`[revy] ${options.kind} returned no content`)
        throw new DomainError('PROVIDER_UNAVAILABLE', 'Recommendations are unavailable right now.')
      }

      return parseCompletion(options.kind, text)
    },
  }
}

/**
 * Reads the model's JSON, or fails loudly.
 *
 * Shares its reasoning with the Gemini transport's parser: a model that wraps
 * its JSON in prose, or stops halfway, must fail here rather than downstream.
 * Swallowing it produces an empty answer, which reads as "nothing fits" -- a
 * wrong answer rather than an error.
 */
export function parseCompletion(kind: string, text: string): RecommenderAnswer {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    console.error(`[revy] ${kind} returned unparseable json`)
    throw new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
  }

  const parsed = answerSchema.safeParse(json)
  if (!parsed.success) {
    console.error(`[revy] ${kind} answer did not match the schema`, parsed.error.issues)
    throw new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
  }

  return {
    understood: parsed.data.understood,
    picks: parsed.data.picks,
    nothingFits: parsed.data.nothingFits,
    question: parsed.data.question,
  }
}

/** The answer shape as JSON Schema, with the key these APIs do not accept removed. */
export function jsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(answerSchema) as Record<string, unknown>
  delete schema.$schema
  return schema
}

/**
 * HTTP status to something a person can act on.
 *
 * 429 and 5xx are mapped to PROVIDER_UNAVAILABLE rather than to their own
 * codes, and that is load-bearing: it is the signal the provider chain reads
 * to mean "try the next one". A rejected key is not -- retrying that elsewhere
 * would hide a misconfiguration behind a working fallback.
 */
function toDomainFailure(kind: string, status: number): DomainError {
  if (status === 429 || status === 413) {
    /*
     * 413 is not about payload bytes here.
     *
     * Groq answers a request that exceeds the *remaining* tokens for the
     * minute with `request_too_large`, including for a tiny body. It means the
     * same thing as 429 and deserves the same treatment: wait, or let the
     * chain try somebody else.
     */
    console.error(`[revy] ${kind} over its token budget for the minute`)
    return new DomainError('PROVIDER_UNAVAILABLE', 'Recommendations are busy right now.')
  }

  if (status === 402) {
    /*
     * Billing. Permanently unavailable rather than transiently, but still
     * routed around: one provider needing a card should not take the feature
     * down when others are configured. Logged loudly enough to act on, because
     * nothing else will ever surface it.
     */
    console.error(
      `[revy] ${kind} requires billing and will never answer -- remove its key or add billing`,
    )
    return new DomainError('PROVIDER_UNAVAILABLE', 'Recommendations are unavailable right now.')
  }

  if (status >= 500) {
    console.error(`[revy] ${kind} server error`, status)
    return new DomainError('PROVIDER_UNAVAILABLE', 'Recommendations are busy right now.')
  }

  console.error(`[revy] ${kind} rejected the request`, status)
  return new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
}

/* ------------------------------------------------------------------ *
 * The two we ship with
 * ------------------------------------------------------------------ */

/**
 * Groq.
 *
 * Fast when it answers, and the tightest free tier of the three: on the larger
 * models it allows roughly twelve thousand tokens a minute, and one of our
 * requests is around eight. So this is realistically one call a minute and a
 * dozen or so a day -- useful as the last link in a chain, not as a primary.
 */
export function createGroqRecommender(
  apiKey: string,
  /*
   * The largest model Groq serves, checked against its own /models endpoint.
   *
   * Model catalogues on these providers turn over fast -- the Llama 3.3 name
   * this defaulted to first had already been retired and returned a 404, which
   * looks exactly like a bad key until you list what is actually available.
   * `GROQ_MODEL` overrides it, and `curl .../v1/models` is how you find the
   * current name when this stops working.
   */
  model = 'openai/gpt-oss-120b',
  fetchImpl?: typeof fetch,
): Recommender {
  return createOpenAICompatibleRecommender({
    apiKey,
    baseUrl: 'https://api.groq.com/openai/v1',
    model,
    kind: 'groq',
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}

/**
 * Cerebras.
 *
 * The most generous free tier of the three for a prompt this size -- around a
 * million tokens a day, which is roughly a hundred and thirty of our requests.
 * The natural second choice behind Gemini.
 */
export function createCerebrasRecommender(
  apiKey: string,
  /** Largest model Cerebras serves. `CEREBRAS_MODEL` overrides it. */
  model = 'gpt-oss-120b',
  fetchImpl?: typeof fetch,
): Recommender {
  return createOpenAICompatibleRecommender({
    apiKey,
    baseUrl: 'https://api.cerebras.ai/v1',
    model,
    kind: 'cerebras',
    ...(fetchImpl ? { fetchImpl } : {}),
  })
}
