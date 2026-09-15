import { type Executor, schema } from '@revy/db'
import type { ContentLanguage } from '@revy/shared/constants'
import { and, eq } from 'drizzle-orm'

/**
 * The translation cache (SPEC 31).
 *
 * Reads and writes only. Deciding whether a translation is wanted, and asking
 * a model for one, belongs to the service -- this knows where they are kept.
 */

export interface StoredTranslation {
  content: string
  provider: string
  createdAt: Date
}

/** The review's own text and language, for deciding whether to translate. */
export async function reviewSource(
  db: Executor,
  reviewId: string,
): Promise<{ content: string; language: string } | null> {
  const [row] = await db
    .select({ content: schema.reviews.content, language: schema.reviews.language })
    .from(schema.reviews)
    .where(eq(schema.reviews.id, reviewId))
    .limit(1)

  return row ?? null
}

export async function findTranslation(
  db: Executor,
  reviewId: string,
  language: ContentLanguage,
): Promise<StoredTranslation | null> {
  const [row] = await db
    .select({
      content: schema.reviewTranslations.content,
      provider: schema.reviewTranslations.provider,
      createdAt: schema.reviewTranslations.createdAt,
    })
    .from(schema.reviewTranslations)
    .where(
      and(
        eq(schema.reviewTranslations.reviewId, reviewId),
        eq(schema.reviewTranslations.language, language),
      ),
    )
    .limit(1)

  return row ?? null
}

/**
 * Stores a translation, replacing any previous one for that language.
 *
 * Upsert rather than insert because two readers can ask for the same
 * translation at the same moment. Both calls will have happened by the time
 * either writes, and the loser of that race should overwrite rather than
 * raise -- the two results are translations of the same text by the same
 * model, so there is nothing to reconcile.
 */
export async function saveTranslation(
  db: Executor,
  reviewId: string,
  language: ContentLanguage,
  content: string,
  provider: string,
): Promise<void> {
  await db
    .insert(schema.reviewTranslations)
    .values({ reviewId, language, content, provider })
    .onConflictDoUpdate({
      target: [schema.reviewTranslations.reviewId, schema.reviewTranslations.language],
      set: { content, provider, createdAt: new Date() },
    })
}

/**
 * Drops every translation of a review.
 *
 * Called when a review is edited. A translation of text that no longer exists
 * is worse than no translation: it is a confident, fluent rendering of a
 * sentence its author has already taken back.
 */
export async function clearTranslations(db: Executor, reviewId: string): Promise<void> {
  await db
    .delete(schema.reviewTranslations)
    .where(eq(schema.reviewTranslations.reviewId, reviewId))
}
