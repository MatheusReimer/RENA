import type { MediaEntry } from '@revy/shared/types'
import { errors } from '@revy/shared/utils'
import type { ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import {
  mediaRepository,
  ratingRepository,
  reviewRepository,
  userRepository,
} from '../repositories'

/**
 * One person's entry on one title (SPEC 10, 27).
 *
 * The thing a shared rating link points at, and the reason it is addressed by
 * `(username, mediaId)` rather than by a rating id: both `ratings` and
 * `reviews` are unique on that pair, so the address is stable across every
 * edit somebody makes afterwards. A rating id would change the moment they
 * un-rated and re-rated, quietly breaking a link already sent.
 *
 * Public, like the profile and the review it shows. Nothing here is visible
 * that was not already visible on `/u/<username>` and on the media page --
 * this is the same facts at their own address, which is what makes them
 * shareable.
 */
export const entryService = {
  async get(ctx: ServiceContext, username: string, mediaId: string): Promise<MediaEntry> {
    const user = await userRepository.findByUsername(ctx.db, username)
    if (!user) throw errors.userNotFound()

    const media = await mediaRepository.findById(ctx.db, mediaId)
    if (!media) throw errors.mediaNotFound()

    const [rating, review] = await Promise.all([
      ratingRepository.find(ctx.db, user.id, mediaId),
      reviewRepository.findByUserAndMedia(ctx.db, user.id, mediaId),
    ])

    /*
     * Neither is a 404, not an empty page.
     *
     * "This person has no opinion on this film" is not a page, and rendering
     * one anyway is a soft 404: a crawler files an unbounded set of them as
     * thin duplicates, and a reader who followed a link gets no signal that
     * they followed a stale one.
     */
    if (!rating && !review) throw errors.notFound('NOT_FOUND', 'No entry here yet.')

    const summary = toUserSummary(user)

    /*
     * `likedByViewer` is deliberately false rather than resolved.
     *
     * The like state belongs to the reader, and this page is cacheable and
     * public; resolving it would make the payload per-viewer for one heart
     * icon. The media page is where a review is liked, and it resolves it
     * properly there.
     */
    return {
      user: summary,
      media: toMedia(media),
      score: rating ? rating.score / 2 : null,
      review: review
        ? {
            id: review.id,
            user: summary,
            mediaId: review.mediaId,
            language: review.language,
            score: rating ? rating.score / 2 : null,
            content: review.content,
            spoiler: review.spoiler,
            likeCount: review.likeCount,
            commentCount: review.commentCount,
            likedByViewer: false,
            createdAt: review.createdAt.toISOString(),
            updatedAt: review.updatedAt.toISOString(),
          }
        : null,
      // The earlier of the two acts, so the date reads as "when they logged
      // this" rather than when they last edited the words.
      createdAt: (review && rating
        ? review.createdAt < rating.createdAt
          ? review.createdAt
          : rating.createdAt
        : (review?.createdAt ?? rating!.createdAt)
      ).toISOString(),
      updatedAt: (review && rating
        ? review.updatedAt > rating.updatedAt
          ? review.updatedAt
          : rating.updatedAt
        : (review?.updatedAt ?? rating!.updatedAt)
      ).toISOString(),
    }
  },
}
