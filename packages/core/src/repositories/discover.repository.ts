import { type Executor, schema } from '@revy/db'
import type { MediaType } from '@revy/shared/types'
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from 'drizzle-orm'

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

/**
 * Titles the community has reviewed most recently.
 *
 * This backs a rail headed "fresh reviews from the community", so it is
 * ordered by when somebody last wrote about a title -- not by rating, and not
 * by what the provider calls popular. A heading that says "fresh" over a chart
 * of all-time favourites is the kind of small lie that makes a whole page feel
 * synthetic.
 *
 * Grouped by media, because a title that drew five reviews this week should
 * appear once rather than filling the rail.
 */
export async function recentlyReviewed(db: Executor, limit: number) {
  return db
    .select({
      id: schema.media.id,
      mediaType: schema.media.mediaType,
      title: schema.media.title,
      coverImageUrl: schema.media.coverImageUrl,
      releaseDate: schema.media.releaseDate,
      /*
       * Half-steps and a sum rather than an average: converting back to the
       * 0.5-5.0 scale is the mapper's job, and doing it in SQL as well would
       * be a second place for that arithmetic to live and drift.
       */
      ratingCount: schema.mediaRatingStats.ratingCount,
      ratingSum: schema.mediaRatingStats.ratingSum,
      // Carries the provider's own score, for the titles this community has
      // not rated -- which on the landing carousel is most of them.
      metadata: schema.media.metadata,
      lastReviewedAt: sql<Date>`max(${schema.reviews.createdAt})`,
    })
    .from(schema.reviews)
    .innerJoin(schema.media, eq(schema.media.id, schema.reviews.mediaId))
    .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    .where(isNotNull(schema.media.coverImageUrl))
    .groupBy(
      schema.media.id,
      schema.mediaRatingStats.ratingCount,
      schema.mediaRatingStats.ratingSum,
    )
    .orderBy(desc(sql`max(${schema.reviews.createdAt})`))
    .limit(limit)
}

/**
 * The figures printed under the home statement.
 *
 * Real counts, not marketing rounding. A seeded development database says
 * eleven members and that is what it should say -- a figure a visitor can
 * check against the screens is the only kind worth printing.
 *
 * "Worlds" is the one constant: there are four kinds of thing in here, and
 * that number is a product decision rather than a row count.
 */
export async function catalogueTotals(db: Executor) {
  const [[titles], [members], [reviews], [threads]] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(schema.media),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.users),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.reviews),
    db.select({ count: sql<number>`count(*)::int` }).from(schema.discussionThreads),
  ])

  return {
    titleCount: titles?.count ?? 0,
    memberCount: members?.count ?? 0,
    reviewCount: reviews?.count ?? 0,
    conversationCount: threads?.count ?? 0,
  }
}

/**
 * A handful of members, for the face pile.
 *
 * Ordered by who joined most recently rather than at random, so the row is
 * stable between renders -- a pile that reshuffles on every navigation reads
 * as a bug, and server and client would disagree about it anyway.
 */
export async function recentMembers(db: Executor, limit: number) {
  return db
    .select({
      id: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      // Aliased to the DTO's field name: this row is returned as a
      // UserSummary without passing through a mapper.
      titleSlug: schema.users.titleBadgeSlug,
    })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .limit(limit)
}

/** The window a review's length has to fall in to fit on a card. */
const QUOTE_MIN_LENGTH = 40
const QUOTE_MAX_LENGTH = 240

/**
 * Short reviews, for the cards in the community section.
 *
 * Three constraints, and each one is doing a job:
 *
 * Spoilers are excluded outright. Everywhere else in the app a spoiler is
 * hidden behind `SpoilerGuard` and the reader chooses; on a landing screen
 * nobody chose to be here, so the only safe review is one that is not a
 * spoiler in the first place.
 *
 * A length floor and ceiling, because the card is two lines. "Loved it" says
 * nothing about why anyone would join, and four paragraphs truncated at 110
 * characters is a quote cut off mid-argument.
 *
 * Most-liked first, so the cards show writing the community itself endorsed
 * rather than whatever was posted most recently -- and, like the face pile,
 * an order that is stable between the server render and the client's.
 */
export async function communityReviews(db: Executor, limit: number) {
  return db
    .select({
      id: schema.reviews.id,
      content: schema.reviews.content,
      likeCount: schema.reviews.likeCount,
      commentCount: schema.reviews.commentCount,
      createdAt: schema.reviews.createdAt,
      mediaId: schema.media.id,
      mediaTitle: schema.media.title,
      mediaType: schema.media.mediaType,
      coverImageUrl: schema.media.coverImageUrl,
      /** Half-steps, or null where the author wrote without scoring. */
      score: schema.ratings.score,
      authorId: schema.users.id,
      authorUsername: schema.users.username,
      authorDisplayName: schema.users.displayName,
      authorAvatarUrl: schema.users.avatarUrl,
      authorTitleSlug: schema.users.titleBadgeSlug,
    })
    .from(schema.reviews)
    .innerJoin(schema.users, eq(schema.users.id, schema.reviews.userId))
    .innerJoin(schema.media, eq(schema.media.id, schema.reviews.mediaId))
    // Left, not inner: a review without a score is still a review, and
    // requiring one would quietly drop them from the wall.
    .leftJoin(schema.ratings, eq(schema.ratings.id, schema.reviews.ratingId))
    .where(
      and(
        eq(schema.reviews.spoiler, false),
        gte(sql`char_length(${schema.reviews.content})`, QUOTE_MIN_LENGTH),
        lte(sql`char_length(${schema.reviews.content})`, QUOTE_MAX_LENGTH),
      ),
    )
    .orderBy(desc(schema.reviews.likeCount), desc(schema.reviews.createdAt))
    .limit(limit)
}

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

/**
 * Recent additions to the catalogue (SPEC 21).
 *
 * Every other rail is driven by ratings, which means a freshly imported
 * catalogue of a thousand titles shows almost nothing -- the aggregates only
 * exist for titles someone has rated. This one is ordered purely by release
 * date, so browsing works from the moment the catalogue is populated and keeps
 * working as it grows.
 */
export async function newReleases(
  db: Executor,
  mediaType: MediaType | null,
  limit: number,
) {
  const conditions = [
    // A card with no art is a grey rectangle; there are plenty with art.
    sql`${schema.media.coverImageUrl} IS NOT NULL`,
    sql`${schema.media.releaseDate} IS NOT NULL`,
    // Nothing unreleased: "new" should mean out, not announced.
    sql`${schema.media.releaseDate} <= CURRENT_DATE`,
  ]
  if (mediaType) conditions.push(eq(schema.media.mediaType, mediaType))

  return db
    .select({
      media: schema.media,
      ratingCount: schema.mediaRatingStats.ratingCount,
      average: sql<number | null>`
        CASE WHEN coalesce(${schema.mediaRatingStats.ratingCount}, 0) = 0 THEN NULL
             ELSE round(
               ${schema.mediaRatingStats.ratingSum}::numeric
               / ${schema.mediaRatingStats.ratingCount} / 2, 1)
        END
      `,
    })
    .from(schema.media)
    .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    .where(and(...conditions))
    .orderBy(desc(schema.media.releaseDate))
    .limit(limit)
}


/**
 * Most recently added to the catalogue (SPEC 21).
 *
 * The fallback for a type where `newReleases` has nothing to order by. Steam
 * gives no release date at list scale, so a release-ordered rail of games is
 * empty -- but the titles are there, and "recently added" is a claim the data
 * actually supports.
 */
export async function recentlyAdded(
  db: Executor,
  mediaType: MediaType | null,
  limit: number,
) {
  const conditions = [sql`${schema.media.coverImageUrl} IS NOT NULL`]
  if (mediaType) conditions.push(eq(schema.media.mediaType, mediaType))

  return db
    .select({
      media: schema.media,
      ratingCount: schema.mediaRatingStats.ratingCount,
      average: sql<number | null>`
        CASE WHEN coalesce(${schema.mediaRatingStats.ratingCount}, 0) = 0 THEN NULL
             ELSE round(
               ${schema.mediaRatingStats.ratingSum}::numeric
               / ${schema.mediaRatingStats.ratingCount} / 2, 1)
        END
      `,
    })
    .from(schema.media)
    .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    .where(and(...conditions))
    .orderBy(desc(schema.media.createdAt))
    .limit(limit)
}

/* ------------------------------------------------------------------ *
 * "Because you liked X"
 *
 * The old version of this was two independent queries: one picked the most
 * recently liked title to put in the heading, the other ranked the whole
 * catalogue against the pooled genres of *everything* the viewer had ever
 * liked. So the row said "Because you liked The Dark Knight" above titles
 * chosen from a taste profile that also contained their comedies and their
 * cookbooks. The heading named one film and the row answered a different
 * question -- which is the one thing a row like this must never do, because
 * naming its reason is the whole reason it beats a chart.
 *
 * `similarToUserTaste` above is still the right shape for Explore's "For
 * you", which is honestly about everything. This is the anchored version.
 * ------------------------------------------------------------------ */

/** Ratings of 4.0 and up, i.e. 8 half-steps. */
const LIKED_THRESHOLD = 8

/**
 * The titles a "because you liked" row can be built on.
 *
 * Newest first, so the rows track what somebody is into now rather than
 * naming something they loved two years ago on every visit. Distinct titles:
 * re-rating the same film should not give it two rows.
 */
export async function recommendationAnchors(db: Executor, userId: string, limit: number) {
  return db
    .selectDistinctOn([schema.ratings.mediaId], {
      media: schema.media,
      ratedAt: schema.ratings.createdAt,
    })
    .from(schema.ratings)
    .innerJoin(schema.media, eq(schema.media.id, schema.ratings.mediaId))
    .where(
      and(eq(schema.ratings.userId, userId), gte(schema.ratings.score, LIKED_THRESHOLD)),
    )
    // `selectDistinctOn` requires the distinct column to lead the ordering, so
    // the recency sort is applied by the caller rather than here.
    .orderBy(schema.ratings.mediaId, desc(schema.ratings.createdAt))
    .limit(limit)
}

/**
 * Titles similar to *one* anchor, with the reason they are here.
 *
 * Two signals, weighted:
 *
 *  - Shared people. The stronger one by far, and only possible now that
 *    credits exist: "another film by this director" is a reason somebody can
 *    check, and it is what makes the row feel like it knows something rather
 *    than like it matched a tag.
 *  - Shared genres. Weak on its own -- "Action, Thriller" describes several
 *    hundred titles -- so it ranks below any credit match and mostly serves
 *    to fill a row for a title whose people we have not imported.
 *
 * The reason is returned as data, not prose: the top shared person's name and
 * the shared genres, for the caller to turn into a sentence in the reader's
 * language. A server that builds display strings can only build them in one.
 */
export async function similarToAnchor(
  db: Executor,
  userId: string,
  anchorId: string,
  limit: number,
) {
  /** People credited on both this title and the anchor. */
  const sharedPeople = sql<number>`(
    SELECT count(DISTINCT mine.person_id)::int
    FROM ${schema.mediaCredits} mine
    WHERE mine.media_id = ${schema.media.id}
      AND mine.person_id IN (
        SELECT theirs.person_id FROM ${schema.mediaCredits} theirs
        WHERE theirs.media_id = ${anchorId}
      )
  )`

  /** The best-billed of those, which is the one worth naming. */
  const topPerson = sql<string | null>`(
    SELECT p.name
    FROM ${schema.mediaCredits} mine
    JOIN ${schema.people} p ON p.id = mine.person_id
    WHERE mine.media_id = ${schema.media.id}
      AND mine.person_id IN (
        SELECT theirs.person_id FROM ${schema.mediaCredits} theirs
        WHERE theirs.media_id = ${anchorId}
      )
    ORDER BY mine.billing ASC
    LIMIT 1
  )`

  /** The role that person has here -- 'director' reads better than 'cast'. */
  const topRole = sql<string | null>`(
    SELECT mine.role
    FROM ${schema.mediaCredits} mine
    WHERE mine.media_id = ${schema.media.id}
      AND mine.person_id IN (
        SELECT theirs.person_id FROM ${schema.mediaCredits} theirs
        WHERE theirs.media_id = ${anchorId}
      )
    ORDER BY mine.billing ASC
    LIMIT 1
  )`

  const sharedGenres = sql<string[]>`(
    SELECT coalesce(array_agg(g.value), ARRAY[]::text[])
    FROM jsonb_array_elements_text(${schema.media.metadata} -> 'genres') AS g(value)
    WHERE g.value IN (
      SELECT jsonb_array_elements_text(a.metadata -> 'genres')
      FROM ${schema.media} a WHERE a.id = ${anchorId}
    )
  )`

  /*
   * One expression, written once.
   *
   * A shared person outweighs any number of shared genres: three is enough
   * that a single credit match beats a title sharing every genre the anchor
   * has, which is the ranking this row exists to produce.
   */
  const score = sql<number>`(
    ${sharedPeople} * 3 + coalesce(array_length(${sharedGenres}, 1), 0)
  )`

  return db
    .select({
      media: schema.media,
      ratingCount: schema.mediaRatingStats.ratingCount,
      average: sql<number | null>`${schema.averageFromStats}`,
      score,
      sharedPeople,
      topPerson,
      topRole,
      sharedGenres,
    })
    .from(schema.media)
    .leftJoin(
      schema.mediaRatingStats,
      eq(schema.mediaRatingStats.mediaId, schema.media.id),
    )
    .where(
      sql`
        ${schema.media.id} <> ${anchorId}
        AND ${schema.media.id} NOT IN (
          SELECT media_id FROM ${schema.ratings} WHERE user_id = ${userId}
        )
      `,
    )
    /*
     * The fragment, not its name.
     *
     * Drizzle does not emit `AS score` for a selected expression -- it maps
     * columns positionally -- so `ORDER BY score` finds nothing and Postgres
     * says `column "score" does not exist`. Passing the fragment re-renders
     * the arithmetic inline, which is the same duplication the old query had
     * except that here it is written once in the source.
     */
    .orderBy(desc(score), desc(sql`coalesce(${schema.averageFromStats}, 0)`))
    .limit(limit)
}
