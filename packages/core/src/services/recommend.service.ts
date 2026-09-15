import { DISCOVERY_MAX_OPTIONS, DISCOVERY_MAX_QUESTIONS, MOODS } from '@revy/shared/constants'
import type {
  DiscoveryAnswer,
  DiscoveryExchange,
  DiscoveryResult,
  MediaType,
} from '@revy/shared/types'
import { releaseYear } from '@revy/shared/utils'
import {
  closedDimensions,
  type DiscoveryCandidate,
  type DiscoveryPick,
  type Recommender,
  type TasteContext,
} from '../ai'
import type { ServiceContext } from '../context'
import { averageScore } from '../mappers'
import { discoveryCandidates, mediaByIds, type CandidateRow, type PickedRow } from '../repositories'
import { tasteService } from './taste.service'

/**
 * Natural language discovery (SPEC 40).
 *
 * Three steps, and the order is the design: pull a candidate set from our
 * catalogue, let the model choose among it, then resolve its choices back to
 * real rows. The model never names a title -- it returns positions in a list
 * we wrote -- so a hallucinated recommendation is not a risk that has to be
 * mitigated, it is a shape the flow does not have.
 */

/**
 * Titles of each type offered to the model.
 *
 * Was 180 -- 720 candidates, about 7,700 tokens -- and measurement against
 * three real providers said that number was the feature's main problem rather
 * than a tuning detail:
 *
 *  - Gemini's free tier does not refuse a prompt that size, it just takes
 *    longer than the timeout, which is every failure seen in testing.
 *  - Groq's free tier allows 8,000 tokens a minute on the models that support
 *    schema-constrained output. A 7,700-token prompt technically fits and
 *    leaves no room for the answer, so every request returns 413.
 *
 * Sixty per type is 240 candidates, roughly 2,600 tokens. That is comfortably
 * inside every free tier with room for a reply, and it cuts the time Gemini
 * spends thinking.
 *
 * The cost is real and worth stating: the model chooses from a third of what
 * it used to see. For a mainstream request -- a war film, something funny --
 * the titles that matter are ranked well within the top sixty of their type.
 * For something niche it is a worse answer than it was. The proper fix is
 * retrieval that knows what was asked rather than a bigger slice of the most
 * popular, which is what a vector index would buy; until then this is the
 * number that makes the feature work at all.
 *
 * `DISCOVERY_CANDIDATES_PER_TYPE` overrides it without a deploy.
 */
export const CANDIDATES_PER_TYPE = Number(process.env.DISCOVERY_CANDIDATES_PER_TYPE) || 60

/** Most results returned. Enough to choose from, few enough to read. */
const RESULT_LIMIT = 8

/** Longest request accepted, in characters. */
export const REQUEST_MAX_LENGTH = 300

export const recommendService = {
  /**
   * Answers a described request.
   *
   * `locale` reaches the model so the answer comes back in the reader's own
   * language. The catalogue is what it is -- English titles from English
   * providers -- but the reasoning about it does not have to be, and a
   * Portuguese speaker reading eight English sentences about why they might
   * like something is the version of this feature that does not get used.
   */
  async discover(
    ctx: ServiceContext,
    recommender: Recommender,
    request: string,
    locale: string,
    options: { answers?: readonly DiscoveryExchange[]; decideNow?: boolean } = {},
  ): Promise<DiscoveryAnswer> {
    const answers = options.answers ?? []

    /*
     * The budget is enforced here, never by the model.
     *
     * A model asked to count its own turns will keep asking, because each
     * individual question looks reasonable from inside the conversation. This
     * is also what makes "just show me something" work: the client sets
     * `decideNow` and the next turn is an answer whatever the model would have
     * preferred.
     */
    /*
     * A skip ends the questioning.
     *
     * "Doesn't matter" is the reader declining to narrow, and the right answer
     * to that is an answer -- not another question about something else. The
     * prompt already says so and the model ignored it in testing: asked for a
     * World War II film, told the kind did not matter, it came back asking
     * about tone with three near-identical options. Instructions are not
     * enforcement, so this is enforcement.
     */
    const lastWasSkip = answers[answers.length - 1]?.skipped === true

    const canAskQuestion =
      !options.decideNow && !lastWasSkip && answers.length < DISCOVERY_MAX_QUESTIONS
    const rows = await discoveryCandidates(ctx.db, { perType: CANDIDATES_PER_TYPE })

    /*
     * The ref-to-row map is built here and used to validate the answer.
     *
     * This is the whole grounding mechanism. Anything the model returns that
     * is not a key in this map is silently dropped, which covers a miscounted
     * index, an invented number, and a model that decided to recommend
     * something it knows we do not have.
     */
    const byRef = new Map<number, CandidateRow>()
    const candidates: DiscoveryCandidate[] = rows.map((row, index) => {
      const ref = index + 1
      byRef.set(ref, row)
      return toCandidate(ref, row)
    })

    const answer = await recommender.discover({
      request,
      candidates,
      locale,
      limit: RESULT_LIMIT,
      answers,
      canAskQuestion,
      taste: await viewerTaste(ctx),
    })

    /*
     * A question, when one was allowed and one came back.
     *
     * Returned instead of results rather than alongside them. The model is
     * told not to do both, and this is what makes that true regardless: a
     * panel that asks "how heavy do you want it?" above eight suggestions has
     * not asked anything, it has just added a control nobody will touch.
     *
     * The options are trimmed and capped here because they are rendered as
     * buttons: a model that returns nine of them, or an empty string among
     * them, produces a row of chips that wraps to three lines with a blank one
     * in it.
     */
    /*
     * A repeated axis is refused here, not merely discouraged in the prompt.
     *
     * The prompt lists the settled axes and the model still came back asking
     * about tone right after being told the tone. Rather than pay for another
     * call to talk it out of that, the question is dropped and the picks it
     * returned alongside are used -- which is the answer the reader wanted one
     * turn earlier anyway.
     */
    const asked = answer.question?.dimension?.trim().toLowerCase()
    const repeatsAnAxis = Boolean(asked && closedDimensions(answers).includes(asked))

    if (canAskQuestion && !repeatsAnAxis && answer.question && answer.question.question.trim()) {
      const options = answer.question.options
        .map((option) => option.trim())
        .filter((option) => option.length > 0)
        .slice(0, DISCOVERY_MAX_OPTIONS)

      return {
        understood: answer.understood,
        results: [],
        nothingFits: null,
        question: {
          question: answer.question.question.trim(),
          options,
          dimension: asked ?? '',
        },
        questionsLeft: DISCOVERY_MAX_QUESTIONS - answers.length - 1,
      }
    }

    const chosen = groundPicks(answer.picks, byRef, RESULT_LIMIT)

    const picked = await mediaByIds(
      ctx.db,
      chosen.map((entry) => entry.id),
    )
    const byId = new Map(picked.map((row) => [row.id, row]))

    /*
     * Rebuilt in the model's order, not the database's.
     *
     * The ranking is the most valuable thing the call produced -- "best first"
     * is most of what makes this better than a filter -- and a join would
     * throw it away for whatever order the planner found cheapest.
     */
    const results: DiscoveryResult[] = []
    for (const entry of chosen) {
      const row = byId.get(entry.id)
      if (row) results.push(toResult(row, entry.because))
    }

    return {
      understood: answer.understood,
      results,
      nothingFits: answer.nothingFits,
      question: null,
      questionsLeft: 0,
    }
  },
}

/**
 * Turns what the model answered into rows we are certain we have.
 *
 * This is the grounding step, and it is the reason a wrong recommendation here
 * cannot be a fictional one. Three things happen, in order:
 *
 *  - A pick whose number is not in the map is dropped. That covers a
 *    miscounted index, an invented number, and a model that decided to
 *    recommend something it knows exists but we do not stock.
 *  - A title picked twice is kept once. Asked for eight, a model will now and
 *    then offer the same film with two different reasons; both are true and
 *    the second is a wasted slot on a short list.
 *  - The limit is applied last, so dropped picks do not eat into it.
 *
 * Exported because this is the property worth testing on its own: it holds
 * without a database, and it is what everything else here relies on.
 */
export function groundPicks(
  picks: readonly DiscoveryPick[],
  byRef: ReadonlyMap<number, { id: string }>,
  limit: number,
): Array<{ id: string; because: string }> {
  const seen = new Set<string>()
  const chosen: Array<{ id: string; because: string }> = []

  for (const pick of picks) {
    const row = byRef.get(pick.ref)
    if (!row || seen.has(row.id)) continue

    seen.add(row.id)
    chosen.push({ id: row.id, because: pick.because })
    if (chosen.length >= limit) break
  }

  return chosen
}

/** A catalogue row as the model sees it. */
export function toCandidate(ref: number, row: CandidateRow): DiscoveryCandidate {
  const ratingCount = row.ratingCount ?? 0
  const year = row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : null

  return {
    ref,
    mediaType: row.mediaType as MediaType,
    title: row.title,
    year: Number.isFinite(year) ? year : null,
    // Two is enough to identify a book. Anthologies run to a dozen names and
    // none of them after the second help somebody decide what to read.
    authors: (row.metadata?.authors ?? []).slice(0, 2),
    genres: usefulGenres(row.metadata?.genres ?? []),
    ratingAverage: averageScore(row.ratingSum ?? 0, ratingCount),
    ratingCount,
    externalRating: row.metadata?.externalRating?.score ?? null,
  }
}

/**
 * Genres worth spending tokens on.
 *
 * TMDB and IGDB publish closed genre lists and need none of this. Open Library
 * publishes *subjects*, which is a different thing wearing the same field: one
 * novel arrives with forty, and among them are shelving artefacts
 * ("nyt:combined-print-and-e-book-fiction=2023-07-02", "collectionID:Ydarkromance"),
 * award keys, and a character's name.
 *
 * The machine-readable ones are dropped by their punctuation, which is what
 * distinguishes them -- a real subject does not contain a colon or an equals
 * sign. What survives is truncated, because past the first few, subjects stop
 * describing the book and start describing the cataloguing.
 */
export function usefulGenres(genres: readonly string[]): string[] {
  return genres.filter((genre) => !/[:=]/.test(genre)).slice(0, 4)
}

/** A picked row as the screen draws it. */
function toResult(row: PickedRow, because: string): DiscoveryResult {
  const ratingCount = row.ratingCount ?? 0

  return {
    id: row.id,
    mediaType: row.mediaType as MediaType,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    releaseYear: releaseYear(row.releaseDate),
    ratingAverage: averageScore(row.ratingSum ?? 0, ratingCount),
    ratingCount,
    reviewCount: row.reviewCount,
    externalRating: row.metadata?.externalRating ?? null,
    because,
  }
}

/**
 * The viewer's standing taste, as the model should hear it (SPEC 21).
 *
 * Signed out, or never onboarded, or onboarded and skipped: all three are
 * `undefined`, and the prompt simply omits the sentence. Personalisation that
 * a reader has not opted into is not a feature.
 *
 * Mood *titles* rather than the genre names behind them. "Something that stays
 * with you" tells a model more about a person than "Drama, History, War,
 * Biography, Western" does -- the genre bundle is a retrieval detail, and
 * handing it over would read as a hard filter rather than a leaning.
 *
 * A failure here is swallowed. This is background colour on somebody's search
 * for a film; it is not worth turning a working recommendation into an error
 * because one extra table did not answer.
 */
async function viewerTaste(ctx: ServiceContext): Promise<TasteContext | undefined> {
  if (!ctx.viewerId) return undefined

  try {
    const taste = await tasteService.get(ctx)
    if (!taste || taste.skipped) return undefined

    const keys = new Set(taste.moodKeys)
    const moods = MOODS.filter((mood) => keys.has(mood.key)).map((mood) => mood.title)
    if (moods.length === 0 && taste.mediaTypes.length === 0) return undefined

    return { moods, mediaTypes: taste.mediaTypes }
  } catch {
    return undefined
  }
}
