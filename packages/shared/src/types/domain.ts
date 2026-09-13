import type {
  ACTIVITY_TYPES,
  FRIENDSHIP_STATUSES,
  LIST_VISIBILITIES,
  MEDIA_STATUSES,
  MEDIA_TYPES,
  NOTIFICATION_TYPES,
} from '../constants'

/* ------------------------------------------------------------------ *
 * Enums (derived from constants so the two can never drift)
 * ------------------------------------------------------------------ */

export type MediaType = (typeof MEDIA_TYPES)[number]
export type MediaStatus = (typeof MEDIA_STATUSES)[number]
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number]
export type ListVisibility = (typeof LIST_VISIBILITIES)[number]
export type ActivityType = (typeof ACTIVITY_TYPES)[number]
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/** All timestamps cross the API boundary as ISO-8601 strings. */
export type IsoDateTime = string

/* ------------------------------------------------------------------ *
 * User (SPEC 6, 22)
 * ------------------------------------------------------------------ */

/** The minimal user shape embedded in feeds, reviews, comments and lists. */
export interface UserSummary {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
}

export interface User extends UserSummary {
  bio: string | null
  createdAt: IsoDateTime
}

/** A user profile as rendered on the profile screen (SPEC 22). */
export interface UserProfile extends User {
  stats: UserStats
  /** Relationship between the viewer and this profile. Null when viewing self. */
  friendship: FriendshipState | null
  isSelf: boolean
  xp: UserXp
}

export interface UserStats {
  ratingCount: number
  reviewCount: number
  friendCount: number
  listCount: number
  /** Ratings broken down by media type, for the profile breakdown. */
  ratingsByType: Record<MediaType, number>
}

export interface UserXp {
  totalXp: number
  level: number
  /** XP earned into the current level. */
  currentLevelXp: number
  /** XP span of the current level. */
  nextLevelXp: number
}

/* ------------------------------------------------------------------ *
 * Media (SPEC 7, 19)
 * ------------------------------------------------------------------ */

export interface Media {
  id: string
  mediaType: MediaType
  title: string
  originalTitle: string | null
  description: string | null
  releaseDate: string | null
  coverImageUrl: string | null
  backdropImageUrl: string | null
  /** Provider-specific extras: runtime, genres, author, page count, seasons. */
  metadata: MediaMetadata
}

/**
 * Loosely typed provider extras. Known keys are declared for ergonomics;
 * unknown keys survive so a new provider needs no schema migration.
 */
export interface MediaMetadata {
  genres?: string[]
  /** Movies: minutes. Series: average episode minutes. */
  runtimeMinutes?: number
  /** Books. */
  authors?: string[]
  pageCount?: number
  publisher?: string
  /** Series. */
  seasonCount?: number
  episodeCount?: number
  /** Games. */
  platforms?: string[]
  developers?: string[]
  /** Free-form passthrough for provider fields we do not model yet. */
  [key: string]: unknown
}

/** Aggregate rating figures shown on the media page (SPEC 19). */
export interface MediaRatingSummary {
  average: number | null
  count: number
  /** Histogram keyed by score ('0.5'..'5.0'), for the ratings breakdown. */
  distribution: Record<string, number>
}

/** The full media detail payload (SPEC 19). */
export interface MediaDetail extends Media {
  ratingSummary: MediaRatingSummary
  /** The viewer's own rating and status. Null when signed out. */
  viewerState: ViewerMediaState | null
  friendRatings: FriendRating[]
  reviewCount: number
  discussionCount: number
}

export interface ViewerMediaState {
  status: MediaStatus | null
  score: number | null
  hasReview: boolean
  inListIds: string[]
  /** Episode for series, page for books. Null when not tracked. */
  progress: number | null
}

export interface FriendRating {
  user: UserSummary
  score: number | null
  status: MediaStatus | null
  ratedAt: IsoDateTime | null
}

/** A search result, which may not be persisted locally yet. */
export interface MediaSearchResult {
  /** Local id when we already have the item; null when it is provider-only. */
  id: string | null
  externalId: string
  provider: string
  mediaType: MediaType
  title: string
  releaseDate: string | null
  coverImageUrl: string | null
  /** Author(s) for books, network/director hint otherwise. Display only. */
  subtitle: string | null
  /**
   * Aggregate score, when the title is already in the catalogue.
   *
   * Null for a provider-only result: nobody here has rated it yet, and
   * borrowing the provider's own score would present someone else's number as
   * this community's opinion.
   */
  averageRating: number | null
  ratingCount: number
}

/* ------------------------------------------------------------------ *
 * Ratings and reviews (SPEC 10, 11)
 * ------------------------------------------------------------------ */

export interface Rating {
  id: string
  userId: string
  mediaId: string
  /** 0.5 .. 5.0 in 0.5 steps. */
  score: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface Review {
  id: string
  user: UserSummary
  mediaId: string
  /** The score attached to this review, when the author also rated. */
  score: number | null
  content: string
  spoiler: boolean
  likeCount: number
  commentCount: number
  likedByViewer: boolean
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** A review joined with its media, for profile and feed surfaces. */
export interface ReviewWithMedia extends Review {
  media: Media
}

/* ------------------------------------------------------------------ *
 * Friendship (SPEC 12)
 * ------------------------------------------------------------------ */

export interface Friendship {
  id: string
  requesterId: string
  receiverId: string
  status: FriendshipStatus
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/**
 * The viewer-relative view of a friendship, which is what the UI actually
 * needs: not 'who requested whom' but 'which button do I show'.
 */
export interface FriendshipState {
  status: FriendshipStatus | 'none'
  /** True when the viewer sent the pending request, so the action is Cancel. */
  isOutgoing: boolean
  friendshipId: string | null
}

export interface FriendRequest {
  id: string
  user: UserSummary
  createdAt: IsoDateTime
}

/* ------------------------------------------------------------------ *
 * Activity feed (SPEC 13, 18)
 * ------------------------------------------------------------------ */

export interface Activity {
  id: string
  type: ActivityType
  user: UserSummary
  media: Media | null
  /** Present for rated_media, and for reviews that carry a score. */
  score: number | null
  /** Present for reviewed_media. */
  review: ActivityReview | null
  /** Present for added_to_list. */
  list: ListSummary | null
  likeCount: number
  commentCount: number
  likedByViewer: boolean
  createdAt: IsoDateTime
}

export interface ActivityReview {
  id: string
  /** Truncated for the feed; the full body lives on the review page. */
  excerpt: string
  spoiler: boolean
}

/* ------------------------------------------------------------------ *
 * Discussions (SPEC 14)
 * ------------------------------------------------------------------ */

export interface DiscussionThread {
  id: string
  mediaId: string
  user: UserSummary
  title: string
  spoiler: boolean
  replyCount: number
  lastActivityAt: IsoDateTime
  createdAt: IsoDateTime
}

export interface DiscussionComment {
  id: string
  threadId: string
  user: UserSummary
  parentCommentId: string | null
  content: string
  spoiler: boolean
  /** 0 for a top-level comment. Capped by COMMENT_MAX_DEPTH. */
  depth: number
  replyCount: number
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** A comment with its loaded children, for rendering a nested thread. */
export interface DiscussionCommentNode extends DiscussionComment {
  replies: DiscussionCommentNode[]
}

/* ------------------------------------------------------------------ *
 * Communities (SPEC 14)
 * ------------------------------------------------------------------ */

/** A media item seen as a place people gather, rather than as a catalogue row. */
export interface CommunitySummary {
  media: Media
  memberCount: number
  threadCount: number
  replyCount: number
  /** Whether the viewer has joined. Null when signed out. */
  joined: boolean | null
  lastActivityAt: IsoDateTime | null
}

export interface CommunityDetail extends CommunitySummary {
  /** A page of members, newest first. */
  members: CommunityMember[]
}

export interface CommunityMember {
  user: UserSummary
  joinedAt: IsoDateTime
}

/* ------------------------------------------------------------------ *
 * Lists (SPEC 15)
 * ------------------------------------------------------------------ */

export interface ListSummary {
  id: string
  name: string
  description: string | null
  visibility: ListVisibility
  itemCount: number
  /** First few covers, for the stacked thumbnails on the lists screen. */
  previewCovers: string[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

export interface MediaList extends ListSummary {
  user: UserSummary
  items: ListItem[]
}

export interface ListItem {
  id: string
  media: Media
  position: number
  note: string | null
  addedAt: IsoDateTime
}

/* ------------------------------------------------------------------ *
 * Notifications (SPEC 23)
 * ------------------------------------------------------------------ */

export interface Notification {
  id: string
  type: NotificationType
  /** The user who caused the notification. Null for system notifications. */
  actor: UserSummary | null
  /** Id of the subject entity; its meaning depends on `type`. */
  entityId: string | null
  /** Denormalised context so the list renders without N extra queries. */
  context: NotificationContext
  readAt: IsoDateTime | null
  createdAt: IsoDateTime
}

export interface NotificationContext {
  mediaTitle?: string
  mediaId?: string
  threadTitle?: string
  threadId?: string
  badgeName?: string
  excerpt?: string
}

/* ------------------------------------------------------------------ *
 * Gamification (SPEC 16, 17)
 * ------------------------------------------------------------------ */

export interface Badge {
  id: string
  slug: string
  name: string
  description: string
  icon: string
}

export interface EarnedBadge extends Badge {
  earnedAt: IsoDateTime
}

/** A badge plus the viewer's progress toward it, for the badges tab. */
export interface BadgeProgress extends Badge {
  earnedAt: IsoDateTime | null
  current: number
  target: number
}

/* ------------------------------------------------------------------ *
 * Discovery (SPEC 21)
 * ------------------------------------------------------------------ */

export interface DiscoverSection {
  key: string
  title: string
  items: DiscoverItem[]
}

export interface DiscoverItem {
  media: Media
  averageRating: number | null
  ratingCount: number
  /** Friends associated with this item, for 'Friends are watching'. */
  friends: UserSummary[]
}
