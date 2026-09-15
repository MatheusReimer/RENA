import { toContentLanguage, type ContentLanguage } from '@revy/shared/constants'
import { errors } from '@revy/shared/utils'
import type { Translator } from '../ai'
import type { ServiceContext } from '../context'
import { findTranslation, reviewSource, saveTranslation } from '../repositories'

/**
 * Translating a review on request (SPEC 31).
 *
 * Lazy and cached: nothing is translated until somebody who reads another
 * language actually opens it, and then it is kept forever. Translating on
 * write would be simpler and would spend most of its budget on text nobody
 * asks for -- with three languages, two thirds of every translation produced
 * up front is waste, and that ratio gets worse with each language added.
 *
 * The result always carries where it came from. A translation presented
 * without its source language is just somebody else's words in your language,
 * which is a quietly dishonest thing to show.
 */

/** What the reader gets back. */
export interface ReviewTranslation {
  reviewId: string
  /** The translated text. */
  content: string
  /** The language it was written in, so the UI can say so. */
  from: ContentLanguage
  to: ContentLanguage
  /** True when this was produced now rather than read from the cache. */
  fresh: boolean
}

export const translationService = {
  /**
   * Translates one review into one language.
   *
   * Signed-in only at the route, because it can spend money. The cache means
   * a popular review costs one call however many people read it.
   */
  async forReview(
    ctx: ServiceContext,
    translator: Translator,
    reviewId: string,
    target: ContentLanguage,
  ): Promise<ReviewTranslation> {
    const source = await reviewSource(ctx.db, reviewId)
    if (!source) throw errors.notFound('NOT_FOUND', 'Review not found.')

    const from = toContentLanguage(source.language)

    /*
     * Asking for a translation into the language it is already in is not an
     * error; it is a reader whose locale happens to match, or a stale UI.
     * Returning the original satisfies it without a call.
     */
    if (from === target) {
      return { reviewId, content: source.content, from, to: target, fresh: false }
    }

    const cached = await findTranslation(ctx.db, reviewId, target)
    if (cached) {
      return { reviewId, content: cached.content, from, to: target, fresh: false }
    }

    const content = await translator.translate({ content: source.content, from, to: target })

    /*
     * Stored after the fact, and a failure to store is not a failure to
     * translate. The reader already has their translation; losing the cache
     * write costs one extra call next time and nothing else, so it must not
     * turn a successful request into an error.
     */
    try {
      await saveTranslation(ctx.db, reviewId, target, content, translator.model)
    } catch (error) {
      console.error('[revy] could not cache translation', error)
    }

    return { reviewId, content, from, to: target, fresh: true }
  },
}
