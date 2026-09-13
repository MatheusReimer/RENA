import { type Executor, schema } from '@revy/db'
import type { MediaType } from '@revy/shared/types'
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

/**
 * Ranking queries for Discover (SPEC 21).
 *
 * SPEC 21 rules out recommendation algorithms: this is aggregation over rows
 * we already have, nothing more. The only non-obvious piece is the weighting
 * in `highestRated`, explained there.
 */

/** How far back "trending" looks. */
const TRENDING_WINDOW_DAYS = 30

/**
 * Ratings an item needs before it can top the highest-rated chart.
 *
 * Without a floor, one person rating something 5.0 outranks a title with a 4.6
 * from ten thousand people. This is the number that stops that.
 */
export const HIGHEST_RATED_MINIMUM = 5

export const discoverRepository = {
  /**
   * Most-rated titles in the recent window (SPEC 21).
   *
   * "Trending" here means local activity, not provider popularity -- it is
   * what the community is actually engaging with. Provider trending is layered
   * on separately by the service when a catalogue offers it.
   */
  async trending(db: Executor, mediaType: MediaType | null, limit: number) {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const conditions = [gte(schema.ratings.createdAt, since)]
    if (mediaType) conditions.push(eq(schema.media.mediaType, mediaType))

    return db
      .select({
        media: schema.media,
        recentRatings: sql<number>`count(${schema.ratings.id})::int`,
        average: sql<number | null>`
          CASE WHEN count(${schema.ratings.id}) = 0 THEN NULL
               ELSE round(avg(${schema.ratings.score})::numeric / 2, 1)
          END
        `,
      })
      .from(schema.ratings)
      .innerJoin(schema.media, eq(schema.media.id, schema.ratings.mediaId))
      .where(and(...conditions))
      .groupBy(schema.media.id)
      .orderBy(desc(sql`count(${schema.ratings.id})`))
      .limit(limit)
  },

  /** Most-rated titles of all time, optionally of one type. */
  async popular(db: Executor, mediaType: MediaType | null, limit: number) {
    const scope = mediaType ? eq(schema.media.mediaType, mediaType) : undefined

    return db
      .select({
        media: schema.media,
        ratingCount: schema.mediaRatingStats.ratingCount,
        average: sql<number | null>`
          CASE WHEN ${schema.mediaRatingStats.ratingCount} = 0 THEN NULL
               ELSE round(
                 ${schema.mediaRatingStats.ratingSum}::numeric
                 / ${schema.mediaRatingStats.ratingCount} / 2, 1)
          END
        `,
      })
      .from(schema.mediaRatingStats)
      .innerJoin(schema.media, eq(schema.media.id, schema.mediaRatingStats.mediaId))
      .where(scope)
      .orderBy(desc(schema.mediaRatingStats.ratingCount))
      .limit(limit)
  },

  /**
   * Highest rated, weighted so a handful of perfect scores cannot win.
   *
   * Uses a Bayesian average: each title's mean is pulled toward the global
   * mean in proportion to how few ratings it has.
   *
   *   weighted = (v / (v + m)) * R  +  (m / (v + m)) * C
   *
   * where R is the title's mean, v its rating count, m the minimum above, and
   * C the mean across everything. A title with one 5.0 sits near C; a title
   * with thousands of ratings sits at its own average. This is arithmetic, not
   * a recommendation model -- SPEC 21 rules the latter out, and this is the
   * standard fix for the "one vote tops the chart" problem.
   */
  async highestRated(db: Executor, mediaType: MediaType | null, limit: number) {
    const scope = mediaType ? eq(schema.media.mediaType, mediaType) : undefined

    // The global mean, in half-steps, across every rated title.
    const globalMean = sql<number>`(
      SELECT coalesce(avg(${schema.ratings.score}), 0) FROM ${schema.ratings}
    )`

    const weighted = sql<number>`
      (
        (${schema.mediaRatingStats.ratingCount}::numeric
          / (${schema.mediaRatingStats.ratingCount} + ${HIGHEST_RATED_MINIMUM}))
        * (${schema.mediaRatingStats.ratingSum}::numeric
           / ${schema.mediaRatingStats.ratingCount})
      ) + (
        (${HIGHEST_RATED_MINIMUM}::numeric
          / (${schema.mediaRatingStats.ratingCount} + ${HIGHEST_RATED_MINIMUM}))
        * ${globalMean}
      )
    `

    return db
      .select({
        media: schema.media,
        ratingCount: schema.mediaRatingStats.ratingCount,
        average: sql<number | null>`
          round(
            ${schema.mediaRatingStats.ratingSum}::numeric
            / ${schema.mediaRatingStats.ratingCount} / 2, 1)
        `,
      })
      .from(schema.mediaRatingStats)
      .innerJoin(schema.media, eq(schema.media.id, schema.mediaRatingStats.mediaId))
      .where(
        scope
          ? and(scope, sql`${schema.mediaRatingStats.ratingCount} > 0`)
          : sql`${schema.mediaRatingStats.ratingCount} > 0`,
      )
      .orderBy(desc(weighted))
      .limit(limit)
  },

  /**
   * What friends are part-way through (SPEC 21).
   *
   * Returns one row per (media, friend) so the service can group the friend
   * avatars onto each card.
   */
  async friendsConsuming(db: Executor, friendIds: string[], limit: number) {
    if (friendIds.length === 0) return []

    return db
      .select({
        media: schema.media,
        user: schema.users,
        updatedAt: schema.userMedia.updatedAt,
      })
      .from(schema.userMedia)
      .innerJoin(schema.media, eq(schema.media.id, schema.userMedia.mediaId))
      .innerJoin(schema.users, eq(schema.users.id, schema.userMedia.userId))
      .where(
        and(
          inArray(schema.userMedia.userId, friendIds),
          eq(schema.userMedia.status, 'in_progress'),
        ),
      )
      .orderBy(desc(schema.userMedia.updatedAt))
      .limit(limit)
  },

  /** What friends have rated most recently (SPEC 21). */
  async friendsRecentlyRated(db: Executor, friendIds: string[], limit: number) {
    if (friendIds.length === 0) return []

    return db
      .select({
        media: schema.media,
        user: schema.users,
        score: schema.ratings.score,
        ratedAt: schema.ratings.createdAt,
      })
      .from(schema.ratings)
      .innerJoin(schema.media, eq(schema.media.id, schema.ratings.mediaId))
      .innerJoin(schema.users, eq(schema.users.id, schema.ratings.userId))
      .where(inArray(schema.ratings.userId, friendIds))
      .orderBy(desc(schema.ratings.createdAt))
      .limit(limit)
  },
}

/**
 * Titles similar to what a user rates highly (SPEC 21).
 *
 * Deliberately not a recommendation model -- SPEC 21 and SPEC 49.6 rule those
 * out, and SPEC 40 puts anything cleverer in the AI phase. This is genre
 * overlap: take the genres on the things you scored 4.0 or better, find other
 * titles sharing them, exclude what you have already rated, and rank by how
 * many genres match and then by community score.
 *
 * The honest framing matters. It is arithmetic over a jsonb array, and the UI
 * should not imply more than that.
 */
export async function similarToUserTaste(
  db: Executor,
  userId: string,
  limit: number,
) {
  /** Ratings of 4.0 and up, i.e. 8 half-steps. */
  const LIKED_THRESHOLD = 8

  return db
    .select({
      media: schema.media,
      ratingCount: schema.mediaRatingStats.ratingCount,
      average: sql<number | null>`
        CASE WHEN ${schema.mediaRatingStats.ratingCount} = 0 THEN NULL
             ELSE round(
               ${schema.mediaRatingStats.ratingSum}::numeric
               / ${schema.mediaRatingStats.ratingCount} / 2, 1)
        END
      `,
      overlap: sql<number>`(
        SELECT count(*)::int
        FROM jsonb_array_elements_text(${schema.media.metadata} -> 'genres') AS g(genre)
        WHERE g.genre IN (
          SELECT jsonb_array_elements_text(liked.metadata -> 'genres')
          FROM ${schema.ratings} r
          JOIN ${schema.media} liked ON liked.id = r.media_id
          WHERE r.user_id = ${userId} AND r.score >= ${LIKED_THRESHOLD}
        )
      )`,
    })
    .from(schema.media)
    .leftJoin(
      schema.mediaRatingStats,
      eq(schema.mediaRatingStats.mediaId, schema.media.id),
    )
    // Nothing already rated: "you might like this" about something you have
    // scored is not a suggestion, it is a reminder.
    .where(
      sql`
        ${schema.media.id} NOT IN (
          SELECT media_id FROM ${schema.ratings} WHERE user_id = ${userId}
        )
        AND jsonb_typeof(${schema.media.metadata} -> 'genres') = 'array'
      `,
    )
    .orderBy(
      desc(sql`(
        SELECT count(*)::int
        FROM jsonb_array_elements_text(${schema.media.metadata} -> 'genres') AS g(genre)
        WHERE g.genre IN (
          SELECT jsonb_array_elements_text(liked.metadata -> 'genres')
          FROM ${schema.ratings} r
          JOIN ${schema.media} liked ON liked.id = r.media_id
          WHERE r.user_id = ${userId} AND r.score >= ${LIKED_THRESHOLD}
        )
      )`),
      desc(sql`coalesce(${schema.mediaRatingStats.ratingSum}::numeric
        / nullif(${schema.mediaRatingStats.ratingCount}, 0), 0)`),
    )
    .limit(limit)
}
