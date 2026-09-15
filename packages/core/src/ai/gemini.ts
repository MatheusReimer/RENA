import { ApiError, GoogleGenAI } from '@google/genai'
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
 * Gemini, as the free way to run natural language discovery (SPEC 40).
 *
 * Second implementation of `Recommender`, and the reason the interface exists.
 * Everything that decides *what a good answer is* -- the instructions, the
 * catalogue rendering, the answer shape, the grounding -- is shared with the
 * Claude transport and imported from beside this file. Only the call differs.
 * A prompt improvement has to reach both, and a change that reaches one is a
 * bug rather than a variation.
 *
 * ---
 *
 * One thing to know before switching this on, because it is not a technical
 * detail: on Google's *free* tier, prompts and responses are used to improve
 * their products. What this feature sends is a sentence somebody typed about
 * what they are in the mood for, which is a more personal thing than it first
 * sounds. Google's paid tier does not do this. The choice is legitimate either
 * way -- it should just be a choice, and the reader arguably deserves to know
 * which one was made.
 */

/**
 * The model, pinned rather than following an alias.
 *
 * `gemini-flash-latest` would be the tidier choice and it is the wrong one
 * here. The alias tracks Google's newest Flash, and on a free key the newest
 * Flash is exactly what everybody else is also trying to use -- measured
 * against a real key, `gemini-flash-latest`, `gemini-3.8-flash` and
 * `gemini-3.7-flash` all returned 503 UNAVAILABLE while this one answered in
 * about a second. Inheriting an upgrade is worth less than answering.
 *
 * `GEMINI_MODEL` overrides it, which is how you move up once capacity for a
 * newer one is reliable.
 */
const DEFAULT_MODEL = 'gemini-3.5-flash'

/**
 * Where a capacity failure goes instead.
 *
 * Free-tier capacity moves around, so a 503 on the preferred model is routine
 * rather than an outage, and one retry elsewhere is the difference between an
 * answer and an apology.
 *
 * It is a real step down, and the measurements say how much: against the same
 * request and the same six hundred titles, the full model returned seven picks
 * in thirteen seconds and the lite models returned two or three in under two
 * -- one of them returned none at all. They are quick because they are not
 * doing the work. So this is a second choice for when there is no first, never
 * a faster default.
 *
 * `gemini-3.5-flash-lite` rather than the `-lite-latest` alias because it
 * measured better on exactly this task, and because sharing a generation with
 * the primary makes the degraded answer resemble the normal one.
 */
const FALLBACK_MODEL = 'gemini-3.5-flash-lite'

/**
 * How long to wait before giving up, in milliseconds.
 *
 * The normal answer takes ten to thirteen seconds; a first measured run took
 * ninety-eight, and a page that sits there that long has failed whatever it
 * eventually returns. Forty seconds is past any healthy response and short
 * enough that the error arrives while somebody is still watching for it.
 */
const TIMEOUT_MS = 40_000

/**
 * How long the preferred model gets before the smaller one is tried.
 *
 * Split out of `TIMEOUT_MS` because a single budget spent entirely on the slow
 * model is a budget that never reaches the fast one. Measured: the primary
 * answers in ten to thirteen seconds when it is healthy and hangs past forty
 * when it is contended, while the lite model answers in about two. So the
 * primary gets a generous-but-bounded slice and the remainder still buys a
 * degraded answer rather than an apology.
 */
const PRIMARY_TIMEOUT_MS = 22_000

/** What is left for the fallback. The lite model needs a fraction of it. */
const FALLBACK_TIMEOUT_MS = TIMEOUT_MS - PRIMARY_TIMEOUT_MS

export interface GeminiRecommenderOptions {
  apiKey: string
  /** Overrides the model alias. */
  model?: string
  /**
   * Points the SDK somewhere else. Injected so a test can see the request
   * without a key or a network, the same reason the media providers take a
   * `fetchImpl` -- the request body is the part most likely to be quietly
   * wrong, and the only way to be sure is to look at it.
   */
  baseUrl?: string
}

export function createGeminiRecommender(options: GeminiRecommenderOptions): Recommender {
  /*
   * Two clients, because the two calls deserve different patience.
   *
   * A per-client timeout rather than a per-request one keeps this working
   * across SDK versions that move `httpOptions` around, and the pair is
   * cheap -- they hold configuration, not connections.
   */
  const build = (timeout: number) =>
    new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: {
        timeout,
        ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
      },
    })

  const client = build(PRIMARY_TIMEOUT_MS)
  const fallbackClient = build(FALLBACK_TIMEOUT_MS)
  const model = options.model || DEFAULT_MODEL

  return {
    available: true,
    kind: 'gemini',

    async discover({
      request,
      candidates,
      locale,
      limit,
      answers,
      canAskQuestion,
      taste,
    }: DiscoveryRequest) {
      let text: string | undefined

      /*
       * The catalogue rides in the system instruction, not the user turn.
       *
       * It keeps the reader's sentence as the only thing in the user role,
       * which is the boundary that matters when the sentence is untrusted:
       * whatever it says, it is data being described rather than an
       * instruction carrying the same authority as ours.
       */
      const config = {
        systemInstruction:
          SYSTEM_INSTRUCTIONS +
          CATALOGUE_HEADING +
          renderCatalogue(candidates) +
          `\n\nReturn at most ${limit} picks. Write "understood", "question", every option, ` +
          `every "because" and "nothingFits" in this language: ${locale}.\n\n` +
          refinementDirective(canAskQuestion, closedDimensions(answers)),
        responseMimeType: 'application/json',
        responseJsonSchema: geminiSchema(),
        /*
         * Low temperature, because this is a retrieval judgement.
         *
         * There is a right answer to "which of these six hundred titles fits
         * what they said", and sampling variety here shows up as the same
         * question giving a worse answer the second time -- which reads as
         * the feature being unreliable rather than creative.
         */
        temperature: 0.3,
      }

      try {
        let response
        try {
          response = await client.models.generateContent({
            model,
            config,
            contents: renderRequest(request, answers, taste),
          })
        } catch (error) {
          /*
           * One retry, on a smaller model, only for capacity.
           *
           * Deliberately not a general retry: a rejected key or a malformed
           * request fails identically the second time, and retrying those
           * just doubles the wait before the same error. 503 is the one
           * failure here that a different model genuinely fixes, and on a
           * free key it is common enough to be worth the branch.
           */
          /*
           * A timeout counts as capacity, not as a different failure.
           *
           * This branch used to test only for an explicit 503, which meant the
           * commonest free-tier failure never reached the fallback: a
           * contended primary does not refuse the request, it simply takes
           * longer than anyone will wait, and the AbortError that produced
           * went straight to the error handler. The reader waited forty
           * seconds for an apology while a model that answers in two sat
           * unused. Both symptoms have the same cause and the same remedy.
           */
          const timedOut = error instanceof Error && error.name === 'AbortError'
          const atCapacity = error instanceof ApiError && error.status === 503

          if ((!timedOut && !atCapacity) || model === FALLBACK_MODEL) {
            throw error
          }

          console.warn(
            `[revy] ${model} ${timedOut ? 'timed out' : 'is at capacity'}; retrying on ${FALLBACK_MODEL}`,
          )
          response = await fallbackClient.models.generateContent({
            model: FALLBACK_MODEL,
            config,
            // The transcript, not the bare sentence: a 503 halfway through a
            // refinement must not silently restart it from the top.
            contents: renderRequest(request, answers, taste),
          })
        }

        text = response.text

        if (!text) {
          /*
           * No text comes back when a safety filter stops the response.
           *
           * Worth its own branch and its own message: the reader can act on
           * "rephrase it", and cannot act on "something went wrong". It is
           * also the one failure here they caused and can fix.
           */
          const blocked = response.promptFeedback?.blockReason
          console.error('[revy] gemini returned no text', blocked ?? 'unknown reason')
          throw new DomainError(
            'PROVIDER_UNAVAILABLE',
            blocked
              ? 'That request was blocked by a safety filter. Try describing it another way.'
              : 'Recommendations came back empty. Try again in a moment.',
          )
        }
      } catch (error) {
        if (error instanceof DomainError) throw error
        toDomainFailure(error)
      }

      return parseAnswer(text)
    },
  }
}

/**
 * The answer schema, in the subset Gemini accepts.
 *
 * Derived from the same zod schema the Claude transport validates against, so
 * the two providers cannot drift into answering differently. Two adjustments
 * are needed on the way out, and both are Gemini's documented limits rather
 * than preferences:
 *
 *  - `$schema` is not among the keywords it reads, and an unknown top-level
 *    keyword is rejected rather than ignored.
 *  - A nullable field comes out of zod as `type: ["string", "null"]`. Gemini
 *    supports `anyOf` but not a type union, so it is rewritten.
 */
export function geminiSchema(): unknown {
  const schema = z.toJSONSchema(answerSchema) as Record<string, unknown>
  delete schema.$schema
  return widenNullableTypes(schema)
}

/** Rewrites `type: [X, "null"]` as `anyOf`, everywhere in the tree. */
export function widenNullableTypes(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(widenNullableTypes)
  if (typeof node !== 'object' || node === null) return node

  const source = node as Record<string, unknown>
  const output: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(source)) {
    if (key === 'type' && Array.isArray(value)) {
      output.anyOf = value.map((type) => ({ type }))
      continue
    }
    output[key] = widenNullableTypes(value)
  }

  return output
}

/**
 * Reads the model's JSON, and refuses to guess when it is wrong.
 *
 * Gemini's schema enforcement is a strong hint rather than the guarantee
 * Claude's constrained decoding gives, so the response is parsed through the
 * same zod schema instead of being trusted. A malformed answer fails here,
 * where it is one error, rather than downstream as an empty result the reader
 * reads as "we have nothing for you".
 */
export function parseAnswer(text: string): RecommenderAnswer {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    console.error('[revy] gemini returned unparseable json')
    throw new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
  }

  const parsed = answerSchema.safeParse(json)
  if (!parsed.success) {
    console.error('[revy] gemini answer did not match the schema', parsed.error.issues)
    throw new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
  }

  return {
    understood: parsed.data.understood,
    picks: parsed.data.picks,
    nothingFits: parsed.data.nothingFits,
    question: parsed.data.question,
  }
}

/**
 * Provider failures, as something a person can act on.
 *
 * The same three-way split the Claude transport makes, because the reader's
 * next move differs: wait, wait longer, or tell somebody the site is
 * misconfigured. 429 gets its own message here rather than being folded in
 * with 5xx -- on a free tier, exhausting the daily quota is the single most
 * likely failure, and "busy, try in a moment" would be a lie about a wait that
 * lasts until midnight Pacific.
 */
function toDomainFailure(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      console.error('[revy] gemini quota exhausted')
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Recommendations have hit their daily limit. Try again tomorrow.',
      )
    }

    if (error.status >= 500) {
      console.error('[revy] gemini temporarily unavailable', error.status)
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Recommendations are busy right now. Try again in a moment.',
      )
    }

    // A rejected key, a model we cannot reach, a malformed request: ours to
    // fix, and none of them improve on a retry.
    console.error('[revy] gemini rejected the request', error.status, error.message)
    throw new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
  }

  /*
   * The timeout, which on a free key is a normal event rather than a bug.
   *
   * It arrives as an AbortError from fetch rather than as an ApiError, so it
   * would otherwise land in the generic branch below and be reported as
   * something the reader cannot act on. It is the opposite: waiting and asking
   * again genuinely works, because the cause is usually load at the far end
   * rather than anything about the request.
   */
  if (error instanceof Error && error.name === 'AbortError') {
    console.error('[revy] gemini timed out')
    throw new DomainError(
      'PROVIDER_UNAVAILABLE',
      'That took too long to come back. Try asking again.',
    )
  }

  console.error('[revy] gemini call failed', error)
  throw new DomainError('INTERNAL_ERROR', 'Recommendations are unavailable right now.')
}
