import { type Executor, schema } from '@revy/db'
import { eq, sql } from 'drizzle-orm'

/**
 * Recommendations from ratings (SPEC 21, 40).
 *
 * The first thing here that is actually a recommender rather than aggregation.
 * `similarToUserTaste` in `discover.repository` is genre overlap and says so;
 * this blends two signals that both come from what people actually scored:
 *
 *  - **Taste neighbours.** Other members who rated highly the same things the
 *    viewer rated highly. Classic item-to-item collaborative filtering: the
 *    more titles somebody agrees with you about, the more their other
 *    favourites count. This works without any content metadata at all, which
 *    is why it beats genre overlap on a catalogue whose descriptions come from
 *    three providers of wildly differing quality.
 *
 *  - **Friends.** Weighted far more heavily, and deliberately so. A stranger
 *    with similar taste is a statistical argument; a friend is a person the
 *    viewer can go and talk to about it, and that conversation is the product.
 *    It is also the signal a large catalogue cannot copy from us.
 *
 * The two degrade independently, which is what makes this safe to put on a
 * screen. Somebody with no friends still gets neighbours. Somebody brand new
 * with no ratings still gets whatever their friends liked. Somebody with
 * neither gets nothing back, and the caller falls through to a rail that does
 * not need a history.
 *
 * The *reason* comes back as data -- how many friends, and which ones -- never
 * as a sentence. A server that builds display strings can only build them in
 * one language, and this product ships in three.
 */

/** Ratings of 4.0 and up, i.e. 8 half-steps. Matches the rest of Discover. */
const LIKED_THRESHOLD = 8

/**
 * How much of the viewer's history defines their taste.
 *
 * Their most recent highly-rated titles, not all of them. Two reasons: it
 * bounds the join for somebody with a thousand ratings, and taste moves --
 * what somebody loved five years ago is a worse predictor than what they loved
 * last month, and letting it weigh the same makes the rail feel stale.
 */
const TASTE_PROFILE_SIZE = 100

/**
 * How many taste neighbours are considered.
 *
 * Without a cap this is every member who has ever agreed with the viewer
 * about anything, which on a healthy catalogue is most of them -- and the
 * hundredth-best neighbour contributes noise, not signal.
 */
const NEIGHBOURHOOD_SIZE = 200

/**
 * What one friend's approval is worth, in units of taste agreement.
 *
 * A neighbour contributes the number of titles they agree with the viewer
 * about, which in practice runs from one to a few dozen. Twelve therefore puts
 * one friend somewhere above a typical neighbour and below a strong one --
 * enough that friends visibly shape the rail, not so much that three friends
 * with scattered taste bury a title fifty neighbours agree on.
 *
 * This is a product decision expressed as a number, which is why it is here
 * with a paragraph attached rather than inline in the SQL.
 */
const FRIEND_WEIGHT = 12

/** How many friend names come back to build the reason from. */
const NAMED_FRIENDS = 2

export interface RecommendationRow {
  media: typeof schema.media.$inferSelect
  ratingCount: number
  average: string | null
  /** Friends who rated it 4.0 or better. */
  friendCount: number
  /** Up to two of them, for the sentence the client writes. */
  friendNames: string[]
  /** Members with similar taste who rated it 4.0 or better. */
  neighbourCount: number
  /** The blended ranking score. Returned for debugging and tuning. */
  score: string
}

/**
 * Titles the viewer has not rated, ranked by who else liked them.
 *
 * One query rather than two passes in JavaScript, because the intermediate
 * result -- every rating by every taste neighbour -- is the large object here,
 * and the point of the aggregate is never to send it anywhere.
 */
export async function recommendedForUser(
  db: Executor,
  userId: string,
  limit: number,
): Promise<RecommendationRow[]> {
  const rows = await db.execute(sql`
    WITH liked AS (
      -- The viewer's taste profile: what they scored 4.0+, most recent first.
      SELECT ${schema.ratings.mediaId} AS media_id
      FROM ${schema.ratings}
      WHERE ${schema.ratings.userId} = ${userId}
        AND ${schema.ratings.score} >= ${LIKED_THRESHOLD}
      ORDER BY ${schema.ratings.updatedAt} DESC
      LIMIT ${TASTE_PROFILE_SIZE}
    ),
    friends AS (
      -- Direction-agnostic, like every other read of this table.
      SELECT CASE
               WHEN ${schema.friendships.requesterId} = ${userId}
               THEN ${schema.friendships.receiverId}
               ELSE ${schema.friendships.requesterId}
             END AS user_id
      FROM ${schema.friendships}
      WHERE ${schema.friendships.status} = 'accepted'
        AND (${schema.friendships.requesterId} = ${userId}
          OR ${schema.friendships.receiverId} = ${userId})
    ),
    neighbours AS (
      -- How many of the viewer's favourites each other member also loved.
      SELECT r.user_id, count(*)::int AS shared
      FROM ${schema.ratings} r
      JOIN liked ON liked.media_id = r.media_id
      WHERE r.user_id <> ${userId}
        AND r.score >= ${LIKED_THRESHOLD}
      GROUP BY r.user_id
      ORDER BY shared DESC
      LIMIT ${NEIGHBOURHOOD_SIZE}
    ),
    raters AS (
      /*
       * Everyone whose opinion counts, and why.
       *
       * A FULL OUTER JOIN rather than a UNION: a friend who is also a strong
       * taste neighbour must appear once carrying both facts. Under a UNION
       * they would appear twice and be counted twice, which would quietly make
       * "friends who happen to agree with you" the highest-scoring signal in
       * the system by accident rather than by decision.
       */
      SELECT
        COALESCE(n.user_id, f.user_id) AS user_id,
        COALESCE(n.shared, 0) AS shared,
        (f.user_id IS NOT NULL) AS is_friend
      FROM neighbours n
      FULL OUTER JOIN friends f ON f.user_id = n.user_id
    ),
    candidates AS (
      SELECT
        r.media_id,
        -- Taste agreement, weighted by how much each neighbour agrees.
        COALESCE(SUM(ra.shared), 0)::numeric AS taste_score,
        COUNT(*) FILTER (WHERE ra.is_friend)::int AS friend_count,
        COUNT(*) FILTER (WHERE NOT ra.is_friend)::int AS neighbour_count,
        -- Two names is all a sentence needs; the rest becomes "and 4 others".
        (ARRAY_AGG(u.display_name) FILTER (WHERE ra.is_friend))[1:${sql.raw(String(NAMED_FRIENDS))}]
          AS friend_names
      FROM ${schema.ratings} r
      JOIN raters ra ON ra.user_id = r.user_id
      JOIN ${schema.users} u ON u.id = r.user_id
      WHERE r.score >= ${LIKED_THRESHOLD}
        -- Never recommend something they have already scored. "You might like
        -- this" about a title they rated is a reminder, not a suggestion.
        AND NOT EXISTS (
          SELECT 1 FROM ${schema.ratings} own
          WHERE own.user_id = ${userId} AND own.media_id = r.media_id
        )
      GROUP BY r.media_id
    )
    SELECT
      m.*,
      COALESCE(s.rating_count, 0)::int AS rating_count,
      CASE WHEN COALESCE(s.rating_count, 0) = 0 THEN NULL
           ELSE round(s.rating_sum::numeric / s.rating_count / 2, 1)
      END AS average,
      c.friend_count,
      c.neighbour_count,
      COALESCE(c.friend_names, ARRAY[]::text[]) AS friend_names,
      (c.friend_count * ${FRIEND_WEIGHT} + c.taste_score) AS score
    FROM candidates c
    JOIN ${schema.media} m ON m.id = c.media_id
    LEFT JOIN ${schema.mediaRatingStats} s ON s.media_id = c.media_id
    ORDER BY score DESC,
             -- Ties broken by what the wider community thinks, so an obscure
             -- title and a beloved one with identical support do not alternate
             -- randomly between page loads.
             COALESCE(s.rating_sum::numeric / NULLIF(s.rating_count, 0), 0) DESC,
             m.id
    LIMIT ${limit}
  `)

  return toRows(rows).map(toRecommendationRow)
}

/**
 * Normalises what `db.execute` hands back, which differs by driver.
 *
 * postgres-js returns the rows as an array. PGlite returns a result object
 * with a `rows` property. This project runs both -- embedded Postgres for a
 * fresh clone, postgres-js everywhere else -- so a repository that assumes
 * either one works in development and throws in production, or the reverse.
 * That is exactly what happened here the first time: `rows.map is not a
 * function`, on the driver the tests use and not the one the app deploys with.
 */
function toRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const rows = (result as { rows?: unknown })?.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}

/**
 * Turns a raw driver row into the shape services expect.
 *
 * `db.execute` returns snake_case columns with no typing, because the query is
 * written as SQL rather than built by the query builder -- which it has to be:
 * Drizzle cannot express a CTE chain with a FULL OUTER JOIN and a filtered
 * array aggregate, and expressing it half in the builder would make it harder
 * to read rather than safer. Every value the query interpolates is a bound
 * parameter, so this is not a string-concatenation risk (OWASP A03).
 */
function toRecommendationRow(row: Record<string, unknown>): RecommendationRow {
  return {
    media: {
      id: row.id,
      externalId: row.external_id,
      provider: row.provider,
      mediaType: row.media_type,
      title: row.title,
      originalTitle: row.original_title,
      description: row.description,
      releaseDate: row.release_date,
      coverImageUrl: row.cover_image_url,
      backdropImageUrl: row.backdrop_image_url,
      metadata: row.metadata,
      syncedAt: row.synced_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    } as typeof schema.media.$inferSelect,
    ratingCount: Number(row.rating_count ?? 0),
    average: row.average === null || row.average === undefined ? null : String(row.average),
    friendCount: Number(row.friend_count ?? 0),
    friendNames: Array.isArray(row.friend_names) ? (row.friend_names as string[]) : [],
    neighbourCount: Number(row.neighbour_count ?? 0),
    score: String(row.score ?? 0),
  }
}

/**
 * A cheap fingerprint of everything that should invalidate a reader's
 * recommendations (SPEC 38).
 *
 * Derived rather than stored, and that is the whole point of it. The obvious
 * design is a `recommendations_version` column bumped on every rating write --
 * which means a migration, a write on the hottest user action in the product,
 * and a counter that can drift from the rows it claims to describe. This
 * cannot drift: it *is* the rows.
 *
 * Count plus the latest timestamp catches all three ways the input can change.
 * A new rating moves both. Re-scoring a title moves `updated_at` only, because
 * the row is upserted in place. Deleting one moves the count down. A count
 * alone would miss the re-score, which is the case a reader is most likely to
 * check immediately afterwards.
 *
 * Costs an index seek on `ratings_user_created_idx` -- around a millisecond
 * against the hundred and fifty the recommendation rails cost, which is the
 * trade this exists to make.
 */
export async function ratingsFingerprint(db: Executor, userId: string): Promise<string> {
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      latest: sql<string | null>`max(${schema.ratings.updatedAt})`,
    })
    .from(schema.ratings)
    .where(eq(schema.ratings.userId, userId))

  return `${row?.total ?? 0}@${row?.latest ?? 'never'}`
}
