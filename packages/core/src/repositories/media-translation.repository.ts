import { type Executor, schema } from '@revy/db'
import { and, eq, inArray, sql } from 'drizzle-orm'

/**
 * Catalogue text in one language.
 *
 * Distinct from `translation.repository`, which caches machine translations of
 * *reviews*. This is the catalogue itself -- titles and plot summaries, mostly
 * editorial rather than translated.
 */
export interface MediaText {
  title: string | null
  description: string | null
}

export interface MediaTranslationUpsert {
  language: string
  title: string | null
  description: string | null
  source: string
}

export const mediaTranslationRepository = {
  /**
   * Text for many titles in one language, in one query.
   *
   * The read path runs on every request that returns catalogue rows, so it is
   * deliberately one indexed lookup over a list of ids rather than a join
   * threaded through two dozen existing queries -- see `localiseMedia` for why
   * the localisation happens after the fact rather than inside each of them.
   */
  async forMedia(
    db: Executor,
    language: string,
    mediaIds: string[],
  ): Promise<Map<string, MediaText>> {
    if (mediaIds.length === 0) return new Map()

    const rows = await db
      .select({
        mediaId: schema.mediaTranslations.mediaId,
        title: schema.mediaTranslations.title,
        description: schema.mediaTranslations.description,
      })
      .from(schema.mediaTranslations)
      .where(
        and(
          eq(schema.mediaTranslations.language, language),
          inArray(schema.mediaTranslations.mediaId, mediaIds),
        ),
      )

    return new Map(
      rows.map((row) => [row.mediaId, { title: row.title, description: row.description }]),
    )
  },

  /** Replaces a title's translations. Idempotent, for the backfill. */
  async upsertMany(
    db: Executor,
    mediaId: string,
    entries: MediaTranslationUpsert[],
  ): Promise<void> {
    if (entries.length === 0) return

    await db
      .insert(schema.mediaTranslations)
      .values(entries.map((entry) => ({ ...entry, mediaId })))
      .onConflictDoUpdate({
        target: [schema.mediaTranslations.mediaId, schema.mediaTranslations.language],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          source: sql`excluded.source`,
          updatedAt: new Date(),
        },
      })
  },

  /** Which of these titles have been asked about, so a backfill can skip them. */
  async translated(db: Executor, mediaIds: string[]): Promise<Set<string>> {
    if (mediaIds.length === 0) return new Set()

    const rows = await db
      .selectDistinct({ mediaId: schema.mediaTranslations.mediaId })
      .from(schema.mediaTranslations)
      .where(inArray(schema.mediaTranslations.mediaId, mediaIds))

    return new Set(rows.map((row) => row.mediaId))
  },
}
