import { type Executor, schema } from '@revy/db'
import type { MediaMetadata, MediaType } from '@revy/shared/types'
import { asc, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm'

/**
 * The candidate set behind natural language discovery (SPEC 40).
 *
 * This is the retrieval half: narrow the catalogue to a set small enough to
 * hand a model, without knowing yet what was asked. Today that is most of the
 * catalogue and the query looks like overkill; it is written this way because
 * the first import that takes us past a few thousand titles would otherwise
 * turn one request into an expensive one silently.
 */

/**
 * How many titles of each type reach the model.
 *
 * A quota per type rather than one global cap, because a global cap is not
 * neutral: films and series outnumber books three to one and games five to
 * one, so the most-popular-N of the whole catalogue would quietly become a
 * film recommender. Somebody asking what to read should not lose to that.
 */
export interface CandidateQuota {
  perType: number
}

/** A title as the candidate query returns it. */
export interface CandidateRow {
  id: string
  mediaType: MediaType
  title: string
  releaseDate: string | null
  metadata: MediaMetadata | null
  ratingCount: number | null
  ratingSum: number | null
}

/** A picked title, with everything a card needs to render. */
export interface PickedRow extends CandidateRow {
  coverImageUrl: string | null
  reviewCount: number
}

/**
 * The most established titles of each type.
 *
 * "Established" is deliberately a blend, and deliberately ordered the way it
 * is: what this community has rated comes first, because that is the signal
 * that belongs to us, and the provider's vote count stands in behind it for
 * the majority of the catalogue nobody here has rated yet.
 *
 * Books meet neither test -- Open Library publishes no popularity figure at
 * all -- so for those the ordering falls through to import order, which is
 * itself popularity-ordered by the importer. Worth knowing rather than
 * discovering: a book's place in this list is inherited from whoever ranked it
 * upstream.
 */
export async function discoveryCandidates(
  db: Executor,
  quota: CandidateQuota,
): Promise<CandidateRow[]> {
  /*
   * How well known a title is, from whichever field carries it.
   *
   * `popularity` first, then the score's own vote count. They are different
   * things and the fallback matters: providers that publish one aggregate
   * (TMDB) put the sample size in `votes` and set no `popularity`, while RAWG
   * publishes a player count alongside a Metacritic score whose critic count
   * it does not share -- so its best titles carry `votes: 0` honestly, and
   * ranking on votes alone put every critically rated game below the
   * free-to-play ones.
   */
  const externalReach = sql<number>`greatest(
    coalesce((${schema.media.metadata} -> 'externalRating' ->> 'votes')::int, 0),
    coalesce((${schema.media.metadata} ->> 'popularity')::int, 0)
  )`
  const externalScore = sql<number>`coalesce((${schema.media.metadata} -> 'externalRating' ->> 'score')::numeric, 0)`

  /*
   * Reach and quality together, with reach on a log scale.
   *
   * Reach alone rewards age: a title accrues ratings for as long as it has
   * existed, so Cyberpunk 2077 at 7.3 outranked Elden Ring at 9.5 and Baldur's
   * Gate III at 9.7, and both of those fell out of the set entirely. Score
   * alone is worse -- it promotes whatever eleven people adored.
   *
   * The logarithm is what makes the blend behave: it treats the gap between
   * fifty ratings and five hundred as large and the gap between five thousand
   * and fifty thousand as small, which is how being well known actually works.
   * A famous title stays in; an acclaimed one is no longer punished for being
   * recent.
   *
   * Titles with no external score at all -- every book -- evaluate to zero and
   * fall through to the tie-breakers below, exactly as they did before.
   */
  const standing = sql<number>`(ln(1 + ${externalReach}::numeric) * ${externalScore})`

  /*
   * Every tie is broken, down to the primary key.
   *
   * Not tidiness. This list is rendered into a cached prompt prefix, and two
   * rows that swap places between requests invalidate the cache for the whole
   * catalogue below them -- turning a tenth-price read into a full-price one
   * for no visible reason. A total order is what makes the cache hold.
   */
  const ranked = db
    .select({
      id: schema.media.id,
      mediaType: schema.media.mediaType,
      title: schema.media.title,
      releaseDate: schema.media.releaseDate,
      metadata: schema.media.metadata,
      ratingCount: schema.mediaRatingStats.ratingCount,
      ratingSum: schema.mediaRatingStats.ratingSum,
      rank: sql<number>`row_number() over (
        partition by ${schema.media.mediaType}
        order by
          coalesce(${schema.mediaRatingStats.ratingCount}, 0) desc,
          ${standing} desc,
          ${externalReach} desc,
          ${schema.media.createdAt} asc,
          ${schema.media.id} asc
      )`.as('rank'),
    })
    .from(schema.media)
    .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    /*
     * A cover is required, and that is a content rule rather than a display
     * one.
     *
     * Every one of these becomes a card the moment it is picked. A title with
     * no artwork is a grey rectangle in a row of posters, and the reader reads
     * that as the recommendation being poor rather than the metadata being
     * absent.
     */
    .where(isNotNull(schema.media.coverImageUrl))
    .as('ranked')

  const rows = await db
    .select({
      id: ranked.id,
      mediaType: ranked.mediaType,
      title: ranked.title,
      releaseDate: ranked.releaseDate,
      metadata: ranked.metadata,
      ratingCount: ranked.ratingCount,
      ratingSum: ranked.ratingSum,
    })
    .from(ranked)
    .where(lte(ranked.rank, quota.perType))
    // Grouped by type, most established first. A model reading a run of films,
    // then a run of books, is being shown the shape of the catalogue as well
    // as its contents.
    .orderBy(asc(ranked.mediaType), asc(ranked.rank))

  return rows as CandidateRow[]
}

/**
 * Full rows for the titles that were picked.
 *
 * Returned in whatever order the planner chose; the service restores the
 * model's ranking, which is the most valuable thing it produced and the one
 * thing a `WHERE id IN (...)` will not preserve.
 */
export async function mediaByIds(db: Executor, ids: readonly string[]): Promise<PickedRow[]> {
  if (ids.length === 0) return []

  const rows = await db
    .select({
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
    })
    .from(schema.media)
    .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
    .where(inArray(schema.media.id, [...ids]))

  return rows as PickedRow[]
}
