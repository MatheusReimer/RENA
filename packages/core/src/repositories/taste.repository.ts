import { type Executor, schema } from '@revy/db'
import type { MediaType } from '@revy/shared/types'
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm'

/** Data access for onboarding taste (SPEC 21). */

export const tasteRepository = {
  async find(db: Executor, userId: string) {
    const [row] = await db
      .select()
      .from(schema.userTaste)
      .where(eq(schema.userTaste.userId, userId))
      .limit(1)
    return row ?? null
  },

  /**
   * Writes the answers, replacing any previous set.
   *
   * Upsert rather than insert: a reader can reopen onboarding, and a second
   * pass should refine what we know rather than fail on a primary key.
   */
  async save(
    db: Executor,
    userId: string,
    input: { mediaTypes: MediaType[]; moodKeys: string[]; skipped: boolean },
  ) {
    const [row] = await db
      .insert(schema.userTaste)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: schema.userTaste.userId,
        set: { ...input, updatedAt: new Date() },
      })
      .returning()
    return row!
  },

  /**
   * Titles to offer for rating (SPEC 21).
   *
   * The seed set has one job: turn a reader with no history into a reader with
   * fifteen ratings, which is the difference between a recommender that can
   * find taste neighbours and one that returns whatever is popular. So the
   * titles have to be *recognisable* -- a set nobody can rate teaches nothing,
   * and the most common failure of this screen is offering obscure titles in
   * the name of being interesting.
   *
   * Hence popularity-ordered, using the same reach-and-score blend as the
   * discovery candidates rather than a second opinion about what "popular"
   * means.
   *
   * What it is **not** yet is *discriminating*. The genuinely informative seed
   * set is the one where opinions split -- a title everybody scores 9 tells
   * you nothing about the person scoring it -- and that wants the variance of
   * `media_rating_stats.distribution`. With almost nothing rated in this
   * database that variance is noise, so it is deliberately not used; the hook
   * is the histogram, and the day there is enough data this ordering should
   * become popularity *times* disagreement.
   *
   * Genres come from the moods the reader picked, which is the only reason to
   * ask that question before this one: it is what keeps a reader who chose
   * horror and strategy games from being handed romantic comedies to rate.
   */
  async seedTitles(
    db: Executor,
    options: {
      userId: string
      mediaTypes: MediaType[]
      genres: string[]
      limit: number
    },
  ) {
    const { userId, mediaTypes, genres, limit } = options

    /*
     * Reach on a log scale blended with the external score -- see
     * `discoveryCandidates`, which reasons about this at length.
     */
    const reach = sql<number>`greatest(
      coalesce((${schema.media.metadata} -> 'externalRating' ->> 'votes')::int, 0),
      coalesce((${schema.media.metadata} ->> 'popularity')::int, 0)
    )`
    const score = sql<number>`coalesce((${schema.media.metadata} -> 'externalRating' ->> 'score')::numeric, 0)`

    /*
     * Titles already rated are excluded, not merely deprioritised.
     *
     * Onboarding is re-openable, and asking somebody to score a film they
     * scored ten minutes ago is the clearest possible signal that nothing they
     * did was recorded.
     */
    const rated = db
      .select({ mediaId: schema.ratings.mediaId })
      .from(schema.ratings)
      .where(eq(schema.ratings.userId, userId))

    const matchesGenre =
      genres.length > 0
        ? sql`(
            jsonb_typeof(${schema.media.metadata} -> 'genres') = 'array'
            AND EXISTS (
              SELECT 1
              FROM jsonb_array_elements_text(${schema.media.metadata} -> 'genres') AS g(genre)
              WHERE g.genre IN (${sql.join(
                genres.map((genre) => sql`${genre}`),
                sql`, `,
              )})
            )
          )`
        : undefined

    /*
     * A quota per kind, not the best of the whole set.
     *
     * Ranking everything together looks right and is not: films carry far more
     * external ratings than games, and books carry none at all, so a reader who
     * picked "movies and games" was handed six films. Somebody who tells us
     * they play games and is then asked to rate Coco has learned that the
     * question was decorative.
     *
     * `row_number()` partitioned by type is the same device `discoveryCandidates`
     * uses for the same reason. The share is ceil, so a limit that does not
     * divide evenly spills over rather than under -- a grid one short of the
     * limit is invisible, a type missing entirely is not.
     */
    const perType = Math.ceil(limit / Math.max(mediaTypes.length, 1))

    const ranked = db
      .select({
        id: schema.media.id,
        title: schema.media.title,
        mediaType: schema.media.mediaType,
        coverImageUrl: schema.media.coverImageUrl,
        releaseDate: schema.media.releaseDate,
        rank: sql<number>`row_number() over (
          partition by ${schema.media.mediaType}
          order by (ln(1 + ${reach}) * greatest(${score}, 1)) desc, ${schema.media.id} asc
        )`.as('rank'),
      })
      .from(schema.media)
      .where(
        and(
          // No cover, no card. This screen is a grid of artwork.
          sql`${schema.media.coverImageUrl} IS NOT NULL`,
          mediaTypes.length > 0 ? inArray(schema.media.mediaType, mediaTypes) : undefined,
          matchesGenre,
          notInArray(schema.media.id, rated),
        ),
      )
      .as('ranked')

    return db
      .select({
        id: ranked.id,
        title: ranked.title,
        mediaType: ranked.mediaType,
        coverImageUrl: ranked.coverImageUrl,
        releaseDate: ranked.releaseDate,
      })
      .from(ranked)
      .where(sql`${ranked.rank} <= ${perType}`)
      /*
       * Interleaved by rank rather than grouped by type, so the top of the grid
       * is one of each rather than every film before the first game. The reader
       * sees their kinds represented without scrolling.
       */
      .orderBy(sql`${ranked.rank} asc`, sql`${ranked.mediaType} asc`)
      .limit(limit)
  },
}
