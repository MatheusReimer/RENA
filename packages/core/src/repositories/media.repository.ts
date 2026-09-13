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
