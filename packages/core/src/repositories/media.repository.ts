import { type Executor, schema } from '@revy/db'
import type { MediaType } from '@revy/shared/types'
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import type { ProviderMedia } from '../providers'

/**
 * Data access for media (SPEC 5).
 *
 * Repositories hold queries and nothing else -- no XP, no notifications, no
 * authorization. Those are the service layer's job. Keeping that line sharp is
 * what lets the whole data layer be swapped without touching business rules.
 */

type MediaRow = typeof schema.media.$inferSelect

export const mediaRepository = {
  async findById(db: Executor, id: string): Promise<MediaRow | null> {
    const [row] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1)
    return row ?? null
  },

  async findManyByIds(db: Executor, ids: string[]): Promise<MediaRow[]> {
    if (ids.length === 0) return []
    return db.select().from(schema.media).where(inArray(schema.media.id, ids))
  },

  async findByExternal(
    db: Executor,
    provider: string,
    externalId: string,
    mediaType: MediaType,
  ): Promise<MediaRow | null> {
    const [row] = await db
      .select()
      .from(schema.media)
      .where(
        and(
          eq(schema.media.provider, provider),
          eq(schema.media.externalId, externalId),
          eq(schema.media.mediaType, mediaType),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /**
   * Writes a refreshed provider score onto an existing row.
   *
   * A targeted merge into `metadata` rather than a full upsert, because the
   * rest of the record is fine: the title, the artwork and the genres were
   * right at import and re-writing them from a detail payload would risk
   * replacing a good value with a thinner one. Only the number that goes
   * stale is touched.
   *
   * `ratingCheckedAt` records that we asked, which is the only way a later
   * run can tell "asked, and the provider has nothing" from "never asked".
   * Without it a title with no score is re-fetched on every run, forever.
   *
   * Deliberately not `syncedAt`: that column is stamped by the importer on
   * every upsert, so it answers "when did we last see this row" and cannot
   * answer "when did we last ask about its score". The first version of this
   * used it, and the backfill selected zero titles because every row in the
   * catalogue already had one.
   */
  async setExternalRating(
    db: Executor,
    mediaId: string,
    rating: { source: string; score: number; votes: number } | null,
  ): Promise<void> {
    const checked = { ratingCheckedAt: new Date().toISOString() }

    await db
      .update(schema.media)
      .set({
        // `||` merges into the existing object, so genres, authors and the
        // rest survive; `-` removes just this key when the provider now says
        // it has nothing.
        metadata: rating
          ? sql`${schema.media.metadata} || ${JSON.stringify({ externalRating: rating, ...checked })}::jsonb`
          : sql`(${schema.media.metadata} - 'externalRating') || ${JSON.stringify(checked)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(schema.media.id, mediaId))
  },

  /**
   * Fills in a description the import could not fetch.
   *
   * Only ever writes over an absent one. A row that already has text got it
   * from a list payload the provider considered canonical, and replacing that
   * with whatever a detail endpoint happens to return is how a good record
   * quietly becomes a worse one.
   *
   * Records `descriptionCheckedAt` whether or not there was anything to write,
   * for the same reason `setExternalRating` records its own marker: without it
   * a title the provider has no blurb for is re-fetched on every future run.
   * Separate from the rating marker because they are separate questions --
   * they come from different endpoints and either can be answered without the
   * other.
   */
  async setDescription(
    db: Executor,
    mediaId: string,
    description: string | null,
  ): Promise<void> {
    const checked = { descriptionCheckedAt: new Date().toISOString() }

    await db
      .update(schema.media)
      .set({
        ...(description
          ? {
              // Coalesced in SQL rather than guarded in the WHERE clause, so
              // the marker is still written for a row that kept its own text.
              description: sql`coalesce(nullif(${schema.media.description}, ''), ${description})`,
            }
          : {}),
        metadata: sql`${schema.media.metadata} || ${JSON.stringify(checked)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(schema.media.id, mediaId))
  },

  /**
   * Inserts a provider item, or refreshes the existing row for it.
   *
   * Uses ON CONFLICT against the (provider, external_id, media_type) unique
   * index rather than select-then-insert: two users opening the same title at
   * the same moment would otherwise race and one would get a duplicate-key
   * error.
   */
  async upsertFromProvider(db: Executor, item: ProviderMedia): Promise<MediaRow> {
    const values = {
      externalId: item.externalId,
      provider: item.provider,
      mediaType: item.mediaType,
      title: item.title,
      originalTitle: item.originalTitle,
      description: item.description,
      releaseDate: item.releaseDate,
      coverImageUrl: item.coverImageUrl,
      backdropImageUrl: item.backdropImageUrl,
      metadata: item.metadata,
      syncedAt: new Date(),
    }

    const [row] = await db
      .insert(schema.media)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.media.provider, schema.media.externalId, schema.media.mediaType],
        set: { ...values, updatedAt: new Date() },
      })
      .returning()

    // The unique index guarantees exactly one row comes back.
    return row!
  },

  /**
   * Local title search, used to surface already-known media instantly while
   * the provider request is still in flight (SPEC 20).
   */
  async searchLocal(
    db: Executor,
    query: string,
    mediaType: MediaType | undefined,
    limit: number,
  ): Promise<MediaRow[]> {
    const pattern = `%${query}%`
    const titleMatch = or(
      ilike(schema.media.title, pattern),
      ilike(schema.media.originalTitle, pattern),
    )

    return db
      .select()
      .from(schema.media)
      .where(mediaType ? and(titleMatch, eq(schema.media.mediaType, mediaType)) : titleMatch)
      .orderBy(desc(schema.media.releaseDate))
      .limit(limit)
  },

  async getRatingStats(db: Executor, mediaId: string) {
    const [row] = await db
      .select()
      .from(schema.mediaRatingStats)
      .where(eq(schema.mediaRatingStats.mediaId, mediaId))
      .limit(1)
    return row ?? null
  },

  async getRatingStatsForMany(db: Executor, mediaIds: string[]) {
    if (mediaIds.length === 0) return []
    return db
      .select()
      .from(schema.mediaRatingStats)
      .where(inArray(schema.mediaRatingStats.mediaId, mediaIds))
  },

  /**
   * Applies a rating change to the denormalised aggregate (SPEC 19, 38).
   *
   * `previousHalfSteps` is null on a first rating and set when re-rating, so
   * one call covers create, update and delete.
   *
   * Every write is an atomic SQL expression rather than a read-modify-write in
   * application code, so concurrent raters cannot lose each other's
   * increments. The caller runs this inside the same transaction as the rating
   * row itself, which is what keeps the aggregate exactly consistent rather
   * than eventually consistent.
   */
  async applyRatingDelta(
    db: Executor,
    mediaId: string,
    nextHalfSteps: number | null,
    previousHalfSteps: number | null,
  ): Promise<void> {
    if (nextHalfSteps === previousHalfSteps) return

    const countDelta = (nextHalfSteps === null ? 0 : 1) - (previousHalfSteps === null ? 0 : 1)
    const sumDelta = (nextHalfSteps ?? 0) - (previousHalfSteps ?? 0)

    await db
      .insert(schema.mediaRatingStats)
      .values({
        mediaId,
        ratingCount: Math.max(0, countDelta),
        ratingSum: Math.max(0, sumDelta),
        distribution: nextHalfSteps === null ? {} : { [String(nextHalfSteps)]: 1 },
      })
      .onConflictDoUpdate({
        target: schema.mediaRatingStats.mediaId,
        set: {
          ratingCount: sql`${schema.mediaRatingStats.ratingCount} + ${countDelta}`,
          ratingSum: sql`${schema.mediaRatingStats.ratingSum} + ${sumDelta}`,
          updatedAt: new Date(),
        },
      })

    // The histogram is maintained as two independent bucket adjustments.
    // Doing it this way rather than as one clever jsonb merge keeps each
    // statement obvious and independently correct.
    if (previousHalfSteps !== null) {
      await adjustBucket(db, mediaId, previousHalfSteps, -1)
    }
    if (nextHalfSteps !== null) {
      await adjustBucket(db, mediaId, nextHalfSteps, 1)
    }
  },
}

/**
 * Adds `delta` to one histogram bucket, clamping at zero and dropping the key
 * entirely when it empties, so the distribution never accumulates 0-valued
 * noise.
 */
async function adjustBucket(
  db: Executor,
  mediaId: string,
  halfSteps: number,
  delta: 1 | -1,
): Promise<void> {
  const key = String(halfSteps)

  await db
    .update(schema.mediaRatingStats)
    .set({
      distribution: sql`
        CASE
          WHEN coalesce((${schema.mediaRatingStats.distribution} ->> ${key})::int, 0) + ${delta} <= 0
            THEN ${schema.mediaRatingStats.distribution} - ${key}
          ELSE jsonb_set(
            ${schema.mediaRatingStats.distribution},
            ARRAY[${key}],
            to_jsonb(coalesce((${schema.mediaRatingStats.distribution} ->> ${key})::int, 0) + ${delta})
          )
        END
      `,
    })
    .where(eq(schema.mediaRatingStats.mediaId, mediaId))
}
