import { type Executor, schema } from '@revy/db'
import type { MediaType } from '@revy/shared/types'
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'

/**
 * Queries behind the Explore screen (SPEC 21).
 *
 * Separate from `discover.repository` because these answer a different
 * question. Those rails rank the catalogue -- what is most rated, newest,
 * trending. These are *ways in* for somebody who does not yet know what they
 * want: a mood, a consensus, or something good that nobody has told them
 * about.
 */

/** A title needs this many ratings before its average is worth ranking on. */
const RANKABLE_MINIMUM = 3

/** How far back "what everyone is talking about" looks. */
const TALKING_WINDOW_DAYS = 30

/**
 * The columns every Explore card needs, and no more.
 *
 * Declared once because four queries return the same card. Re-listing them
 * per query is how one of them quietly ends up missing a field and the row
 * renders without a score.
 */
function cardColumns() {
  return {
    id: schema.media.id,
    mediaType: schema.media.mediaType,
    title: schema.media.title,
    coverImageUrl: schema.media.coverImageUrl,
    releaseDate: schema.media.releaseDate,
    metadata: schema.media.metadata,
    ratingCount: schema.mediaRatingStats.ratingCount,
    ratingSum: schema.mediaRatingStats.ratingSum,
    reviewCount: sql<number>`(
      SELECT count(*)::int FROM ${schema.reviews}
      WHERE ${schema.reviews.mediaId} = ${schema.media.id}
    )`,
  }
}

/**
 * "What everyone's talking about" -- most *discussed*, not most highly rated.
 *
 * Ordered by how much activity a title drew in the recent window, counting
 * ratings and reviews together. The heading is about conversation, so a
 * quietly excellent film nobody mentions should not top it, and a divisive one
 * everybody argues over should.
 */
export async function mostDiscussed(db: Executor, mediaType: MediaType | null, limit: number) {
  /*
   * An ISO string, not a `Date`, and the cast says which kind of instant.
   *
   * A value bound through a column -- `gte(schema.ratings.createdAt, since)` --
   * is encoded by that column's type on the way to the driver. A value
   * interpolated into a raw `sql` fragment has no column to be encoded by, so
   * it reaches the driver exactly as written here, and the two drivers this
   * runs on disagree about what to do with a `Date`: PGlite accepts one,
   * postgres-js refuses it with `The "string" argument must be of type string
   * ... Received an instance of Date`.
   *
   * So this worked on every laptop and 500'd on production, which is the worst
   * shape a bug can have. Passing a string means both drivers are handed the
   * same thing, and `::timestamptz` means the server is told what it is rather
   * than left to infer it from the comparison.
   */
  const since = new Date(Date.now() - TALKING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const activity = sql<number>`(
    (SELECT count(*)::int FROM ${schema.ratings}
     WHERE ${schema.ratings.mediaId} = ${schema.media.id}
       AND ${schema.ratings.createdAt} >= ${since}::timestamptz)
    +
    (SELECT count(*)::int * 2 FROM ${schema.reviews}
     WHERE ${schema.reviews.mediaId} = ${schema.media.id}
       AND ${schema.reviews.createdAt} >= ${since}::timestamptz)
  )`

  const conditions = [isNotNull(schema.media.coverImageUrl)]
  if (mediaType) conditions.push(eq(schema.media.mediaType, mediaType))

  return db
    .select(cardColumns())
    .from(schema.media)
    .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    .where(and(...conditions))
    /*
     * A review counts double.
     *
     * Writing a paragraph about something is a stronger signal that people are
     * talking about it than tapping a star, and the heading is specifically
     * about talk. Ranking the two equally makes this the ratings chart again
     * under a different name.
     */
    .orderBy(desc(activity), desc(sql`coalesce(${schema.mediaRatingStats.ratingCount}, 0)`))
    .limit(limit)
}

/**
 * "You might not know these yet" -- well loved, barely known.
 *
 * Two conditions, and both matter: rated highly enough to be worth someone's
 * evening, and rated by few enough people that it is genuinely a discovery.
 * Drop the ceiling and this becomes the popular chart; drop the floor and it
 * becomes a list of things one person liked.
 */
export async function hiddenGems(db: Executor, mediaType: MediaType | null, limit: number) {
  const average = sql<number>`(
    ${schema.mediaRatingStats.ratingSum}::numeric / ${schema.mediaRatingStats.ratingCount} / 2
  )`

  /*
   * The ceiling is relative, not a magic number.
   *
   * A fixed "fewer than 500 ratings" is right for a mature catalogue and
   * absurd for this one, where nothing has 500. Taking the median rating count
   * means "less known than the typical rated title" stays true at every size
   * the catalogue passes through.
   */
  const medianCount = sql<number>`(
    SELECT coalesce(
      percentile_cont(0.5) WITHIN GROUP (ORDER BY ${schema.mediaRatingStats.ratingCount}),
      0
    )
    FROM ${schema.mediaRatingStats}
    WHERE ${schema.mediaRatingStats.ratingCount} >= ${RANKABLE_MINIMUM}
  )`

  const conditions = [
    isNotNull(schema.media.coverImageUrl),
    gte(schema.mediaRatingStats.ratingCount, RANKABLE_MINIMUM),
    sql`${average} >= 3.8`,
    lte(schema.mediaRatingStats.ratingCount, medianCount),
  ]
  if (mediaType) conditions.push(eq(schema.media.mediaType, mediaType))

  return db
    .select(cardColumns())
    .from(schema.media)
    .innerJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    .where(and(...conditions))
    .orderBy(desc(average), desc(schema.mediaRatingStats.ratingCount))
    .limit(limit)
}

/**
 * Titles matching a mood, which is to say matching a set of genres.
 *
 * Moods are not a column and should not become one. They are an editorial
 * grouping over the genres providers already give us -- which means a new mood
 * is a few words in a constant rather than a migration and a backfill, and a
 * mood that turns out to be a bad idea costs nothing to delete.
 *
 * Ranked by rating, with a floor: a mood row is a recommendation, and there is
 * no point recommending something nobody has vouched for.
 */
export async function byGenres(
  db: Executor,
  genres: readonly string[],
  mediaTypes: readonly MediaType[] | null,
  limit: number,
) {
  const average = sql<number>`(
    ${schema.mediaRatingStats.ratingSum}::numeric / ${schema.mediaRatingStats.ratingCount} / 2
  )`

  const conditions = [
    isNotNull(schema.media.coverImageUrl),
    gte(schema.mediaRatingStats.ratingCount, RANKABLE_MINIMUM),
    /*
     * Overlap against the metadata's genre array.
     *
     * Every genre is bound as a parameter rather than pasted into the string.
     * These names come from a constant in this repository today, so nothing
     * user-supplied reaches it -- but a query that is only safe because of
     * where its inputs happen to come from is one refactor away from not
     * being safe, and that refactor will not look dangerous.
     *
     * `jsonb_array_elements_text` rather than the `?|` operator for the same
     * reason: `?|` needs its right-hand side as a literal `text[]`, which is
     * exactly the shape that invites string building.
     */
    sql`EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(${schema.media.metadata} -> 'genres') AS g(genre)
      WHERE g.genre IN (${sql.join(
        genres.map((genre) => sql`${genre}`),
        sql`, `,
      )})
    )`,
  ]
  if (mediaTypes?.length) conditions.push(inArray(schema.media.mediaType, [...mediaTypes]))

  return db
    .select(cardColumns())
    .from(schema.media)
    .innerJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    .where(and(...conditions))
    .orderBy(desc(average), desc(schema.mediaRatingStats.ratingCount))
    .limit(limit)
}
