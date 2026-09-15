import type {
  DashboardReview,
  DashboardSummary,
  PopularItem,
  RecommendationRow,
  RecommendedItem,
} from '@revy/shared/types'
import { excerpt } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toUserSummary } from '../mappers'
import {
  dashboardActivity,
  dashboardReviews,
  discoverRepository,
  friendsInProgress,
  friendshipRepository,
  libraryCounts,
  recommendationAnchors,
  similarToAnchor,
} from '../repositories'

/**
 * The signed-in home screen.
 *
 * One request for the whole page. Every piece of it is a small projection --
 * a handful of counters, four reviews, five posters -- and splitting them into
 * six endpoints would cost six times the latency to save nothing, on the one
 * screen a member opens most often.
 *
 * Everything here is viewer-scoped, so unlike the landing screen's payload
 * this can never be cached at the edge. That is the reason the two are
 * separate services rather than one with a branch.
 */

/** Review cards in the trending row. The design shows four. */
const REVIEW_COUNT = 4

/** People in the "friends are watching" panel. */
const FRIEND_COUNT = 4

/** Rows in the "popular right now" chart. */
const POPULAR_COUNT = 5

/** Posters in each recommendations row. */
const RECOMMENDATION_COUNT = 8

/**
 * How many "because you liked X" rows to build.
 *
 * Three, because one is a coincidence and five is the whole page. Each costs
 * its own query, and they run together.
 */
const RECOMMENDATION_ROWS = 3

/**
 * How much of a description reaches a hover caption.
 *
 * Two lines at the size these cards draw it. The source text is nothing like
 * that -- RAWG's game blurbs average a thousand characters and reach nearly
 * two thousand -- so trimming here rather than in the component keeps the rest
 * off the wire entirely, for a caption most readers never open.
 */
const BLURB_LENGTH = 130

/**
 * Splits a review into a headline and a body.
 *
 * Reviews have no title field and should not grow one: asking someone for a
 * headline as well as an opinion is how you get fewer opinions. What a writer
 * leads with is already their headline, so the first sentence is promoted to
 * one and the rest becomes the body.
 *
 * A review with no sentence break at all keeps its opening clause as the
 * headline and repeats nothing underneath -- better a card with one line than
 * a card whose two lines say the same thing.
 */
export function splitReview(content: string): { headline: string; body: string } {
  const trimmed = content.trim()
  // A full stop, question or exclamation followed by a space. Not a regex over
  // abbreviations -- "Dr. Strange" would split, and the cost of that is a
  // slightly short headline rather than anything broken.
  const match = trimmed.match(/^(.{15,120}?[.!?])\s+(.*)$/s)

  if (!match) return { headline: excerpt(trimmed, 72), body: '' }

  return {
    headline: match[1]!.trim(),
    body: excerpt(match[2]!.trim(), 150),
  }
}

function toPopularItem(row: {
  id: string
  title: string
  mediaType: PopularItem['mediaType']
  coverImageUrl: string | null
}): PopularItem {
  return {
    id: row.id,
    title: row.title,
    mediaType: row.mediaType,
    coverImageUrl: row.coverImageUrl,
  }
}

export const dashboardService = {
  async get(ctx: ServiceContext, mediaType: string | null): Promise<DashboardSummary> {
    // Narrowed rather than asserted. The `!` this replaces was a promise that
    // every caller had already checked -- true at the time and not checkable.
    const { viewerId } = requireViewer(ctx)
    const friendIds = await friendshipRepository.listFriendIds(ctx.db, viewerId)

    const [activity, library, reviewRows, friendRows, popularRows, anchors] = await Promise.all([
      dashboardActivity(ctx.db, viewerId),
      libraryCounts(ctx.db, viewerId),
      dashboardReviews(ctx.db, mediaType, REVIEW_COUNT),
      friendsInProgress(ctx.db, friendIds, FRIEND_COUNT),
      discoverRepository.trending(ctx.db, null, POPULAR_COUNT),
      recommendationAnchors(ctx.db, viewerId, RECOMMENDATION_ROWS),
    ])

    /*
     * One query per anchor, run together.
     *
     * `selectDistinctOn` has to order by the distinct column first, so the
     * anchors come back in media-id order and are re-sorted here -- newest
     * liked first, so the top row is about what this person is into now.
     */
    const recommendations = await buildRecommendations(
      ctx,
      viewerId,
      [...anchors].sort((a, b) => b.ratedAt.getTime() - a.ratedAt.getTime()),
    )

    const reviews: DashboardReview[] = reviewRows.map((row) => {
      const { headline, body } = splitReview(row.content)

      return {
        id: row.id,
        author: {
          id: row.authorId,
          username: row.authorUsername,
          displayName: row.authorDisplayName,
          avatarUrl: row.authorAvatarUrl,
          titleSlug: row.authorTitleSlug,
        },
        mediaId: row.mediaId,
        mediaTitle: row.mediaTitle,
        mediaType: row.mediaType,
        coverImageUrl: row.coverImageUrl,
        // Scores are stored as half-steps; /2 puts them back on the 0.5-5 scale.
        score: row.score === null ? null : row.score / 2,
        headline,
        body,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        createdAt: row.createdAt.toISOString(),
      }
    })

    return {
      activity,
      library,
      reviews,
      friends: friendRows.map((row) => ({
        user: toUserSummary({
          id: row.userId,
          username: row.username,
          displayName: row.displayName,
          avatarUrl: row.avatarUrl,
        } as Parameters<typeof toUserSummary>[0]),
        mediaId: row.mediaId,
        mediaTitle: row.mediaTitle,
        mediaType: row.mediaType,
        updatedAt: row.updatedAt.toISOString(),
      })),
      popular: popularRows.map((row) => toPopularItem(row.media)),
      recommendations,
    }
  },
}

/**
 * Builds the "because you liked X" rows.
 *
 * The heading and the items come from the same anchor, which is the whole
 * point of the rewrite: the previous version named the most recently liked
 * title and then filled the row from the viewer's entire taste profile, so
 * the heading was decoration rather than an explanation.
 *
 * A row with nothing connected to its anchor is dropped rather than padded.
 * "Because you liked The Dark Knight" over six titles that share nothing with
 * it is worse than one fewer row -- it teaches the reader that the heading
 * does not mean anything, and then the ones that *are* connected stop landing
 * too.
 */
async function buildRecommendations(
  ctx: ServiceContext,
  viewerId: string,
  anchors: Array<{ media: Parameters<typeof toPopularItem>[0]; ratedAt: Date }>,
): Promise<RecommendationRow[]> {
  if (anchors.length === 0) return []

  const rows = await Promise.all(
    anchors.map(async (anchor) => ({
      anchor: toPopularItem(anchor.media),
      similar: await similarToAnchor(ctx.db, viewerId, anchor.media.id, RECOMMENDATION_COUNT),
    })),
  )

  /*
   * A title appears in one row only.
   *
   * Two anchors by the same director recommend largely the same films, and
   * three rows showing the same six posters reads as a bug rather than as
   * agreement. First row wins, which is the one anchored on the most recent
   * thing they liked.
   */
  const used = new Set<string>()
  const result: RecommendationRow[] = []

  for (const row of rows) {
    const items: RecommendedItem[] = []

    for (const candidate of row.similar) {
      // Nothing in common is not a suggestion, it is filler.
      if (candidate.score <= 0) continue
      if (used.has(candidate.media.id)) continue

      used.add(candidate.media.id)
      items.push({
        ...toPopularItem(candidate.media),
        ...reasonFor(candidate),
        // The average is computed in SQL, so Postgres hands it back as a
        // string; the count is already cast to int.
        ratingAverage: candidate.average === null ? null : Number(candidate.average),
        ratingCount: candidate.ratingCount ?? 0,
        externalRating: candidate.media.metadata.externalRating ?? null,
        blurb: candidate.media.description
          ? excerpt(candidate.media.description, BLURB_LENGTH)
          : null,
      })
    }

    if (items.length > 0) result.push({ anchor: row.anchor, items })
  }

  return result
}

/**
 * Why a title is in a row, as a key and its parameters.
 *
 * A shared person always wins the explanation, even where genres also match:
 * "Directed by Christopher Nolan" is something the reader can verify and act
 * on, while "Also Action, Thriller" describes several hundred titles and
 * explains none of them.
 */
function reasonFor(candidate: {
  sharedPeople: number
  topPerson: string | null
  topRole: string | null
  sharedGenres: string[] | null
}): { reasonKey: string; reasonParams: Record<string, string> } {
  if (candidate.sharedPeople > 0 && candidate.topPerson) {
    return {
      reasonKey: `recommend.role.${candidate.topRole ?? 'cast'}`,
      reasonParams: { name: candidate.topPerson },
    }
  }

  const genres = candidate.sharedGenres ?? []
  if (genres.length > 0) {
    // Two at most. A card is a poster and a caption; a list of five genres is
    // neither, and the third one was never the reason anyway.
    return {
      reasonKey: 'recommend.genres',
      reasonParams: { genres: genres.slice(0, 2).join(', ') },
    }
  }

  return { reasonKey: 'recommend.similar', reasonParams: {} }
}
