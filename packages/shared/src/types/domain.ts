import type {
  ACTIVITY_TYPES,
  CREDIT_ROLES,
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
export type CreditRole = (typeof CREDIT_ROLES)[number]

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
  /**
   * The slug of the badge shown beside their name, or null (SPEC 17).
   *
   * A slug rather than a name, because the name is rendered in the reader's
   * language, not the writer's -- and a Portuguese reader looking at an
   * English speaker's comment should still see "Avaliador Ávido".
   */
  titleSlug: string | null
}

export interface User extends UserSummary {
  bio: string | null
  /**
   * The language this person reads and writes in (SPEC 31).
   *
   * Sent to the client so the interface can follow the account rather than the
   * browser: signing in on a borrowed laptop should not hand somebody an
   * interface in a language they do not read.
   */
  language: string
  createdAt: IsoDateTime
}

/** A user profile as rendered on the profile screen (SPEC 22). */
export interface UserProfile extends User {
  stats: UserStats
  /** Relationship between the viewer and this profile. Null when viewing self. */
  friendship: FriendshipState | null
  isSelf: boolean
  xp: UserXp
  /** Everything they have earned, rarest first. The trophy cabinet. */
  badges: EarnedBadge[]
  /**
   * The one badge shown beside their name elsewhere in the product.
   *
   * Their rarest, which is what somebody would pick anyway -- and picking a
   * default matters more than it sounds: a title nobody has set is a feature
   * that looks broken for every user who has not found the setting. Null only
   * when they have earned nothing at all.
   */
  title: EarnedBadge | null
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
  /**
   * The provider's own aggregate score, kept alongside RENA's.
   *
   * Two numbers, not one. RENA's rating is the only one that belongs to this
   * community and it is the one that should lead -- but on a catalogue this
   * young most titles have a handful of local ratings or none, and a page that
   * can only say "nobody here has rated this" is a dead end. The provider's
   * score is what fills that gap until the community's own is worth trusting.
   *
   * Normalised to 0-10 at capture so the UI never has to know which provider
   * it came from, and always carrying `source` because it must be attributed:
   * this is somebody else's number and the page has to say whose.
   */
  externalRating?: {
    /** Attribution, shown to the reader: 'TMDB', 'IGDB', 'Metacritic'. */
    source: string
    /** 0-10, one decimal. */
    score: number
    /** How many people it is based on; 0 when the provider does not say. */
    votes: number
  }
  /**
   * How well known a title is at its provider, as a raw count.
   *
   * Deliberately separate from `externalRating.votes`, which is the sample
   * size *of that score* and must stay honest -- RAWG publishes no critic
   * count behind a Metacritic number, so those carry zero votes.
   *
   * Ranking on votes alone therefore buried every critically rated game
   * beneath the free-to-play ones, whose player-rating counts are enormous:
   * Elden Ring sat sixty places below Garry's Mod. This field is the
   * popularity signal that comparison actually wanted, and it is available
   * whichever score ends up being displayed.
   */
  popularity?: number
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
  /**
   * The title's community, which is the title itself (SPEC 14).
   *
   * Here rather than behind its own request because the Join control sits in
   * the header: fetched separately it would paint as "Join" for everybody and
   * then correct itself a moment later for the people who already had, which
   * is the one state a membership button must never show wrongly.
   *
   * The member *list* is still its own request -- it is a tab further down,
   * and nobody should wait on it to see the page.
   */
  memberCount: number
  /** Whether the viewer has joined. Null when signed out. */
  joined: boolean | null
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

/* ------------------------------------------------------------------ *
 * People and credits
 *
 * A facet of the catalogue, not a community: the value of a title community
 * is that everybody in it consumed the same object and can argue about the
 * same ending, and a director has no such object. So a person gets a page
 * through their work, and the conversation stays on the titles.
 * ------------------------------------------------------------------ */

export interface PersonSummary {
  id: string
  name: string
  imageUrl: string | null
}

export interface Person extends PersonSummary {
  metadata: PersonMetadata
}

export interface PersonMetadata {
  /** TMDB's own one-line summary of what they are known for. */
  knownForDepartment?: string
  biography?: string
  birthday?: string
  placeOfBirth?: string
  [key: string]: unknown
}

/** One person's credit on one title, as shown on a media page. */
export interface MediaCredit {
  person: PersonSummary
  role: CreditRole
  /** Cast only. */
  character: string | null
}

/** One title in a person's filmography, as shown on their page. */
export interface PersonCredit {
  media: Media
  role: CreditRole
  character: string | null
  /** RENA's own average. Null when nobody here has rated it. */
  ratingAverage: number | null
  ratingCount: number
}

export interface PersonDetail extends Person {
  credits: PersonCredit[]
  /**
   * The roles this person is credited in, most defining first.
   *
   * Derived server-side so the page does not have to know the ordering rule:
   * somebody who both directed and acted in something is a director here,
   * because that is how the title is remembered.
   */
  roles: CreditRole[]
  creditCount: number
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
  /** BCP-47 tag the review was written in. Never null: see the column. */
  language: string
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

/**
 * One person's entry on one title -- the thing a shared link points at.
 *
 * Keyed on the *pair*, not on a rating id, and that is the whole design. Both
 * `ratings` and `reviews` are unique on (user, media), so this URL survives
 * everything that happens afterwards: re-scoring four stars to five, adding a
 * review a week later, deleting the review and keeping the score. A link
 * somebody sent their friend in March still resolves in December, which is the
 * one property a share link has to have.
 *
 * Either half may be absent. A score with no words is the common case; a
 * review with no score is allowed too (`reviews.rating_id` is nullable). Both
 * absent means there is no entry, which is a 404 rather than an empty page.
 */
export interface MediaEntry {
  user: UserSummary
  media: Media
  /** Their score, 0.5-5.0, or null when they wrote without scoring. */
  score: number | null
  /** Their review, when they wrote one. */
  review: Review | null
  /** When they first recorded this entry. */
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

/**
 * The three ways to look at the directory.
 *
 * Named rather than inlined because the page, the API client and the route
 * validator all have to agree on it, and two of the three are compiled
 * separately from the third.
 */
/* ------------------------------------------------------------------ *
 * Taste / onboarding (SPEC 21)
 * ------------------------------------------------------------------ */

/** What a reader said they were into, before they had rated anything. */
export interface UserTaste {
  mediaTypes: MediaType[]
  /** `MOODS` keys, not genre names. */
  moodKeys: string[]
  skipped: boolean
}

/**
 * One title offered for rating during onboarding.
 *
 * Deliberately not `Media`: the card shows a cover, a title and a year, and
 * sending the full row -- description, metadata, credits -- would be twenty
 * times the payload for a screen that shows twenty of them at once.
 */
export interface SeedTitle {
  id: string
  title: string
  mediaType: MediaType
  coverImageUrl: string | null
  /** Already formatted by `releaseYear`; empty string when unknown. */
  releaseYear: string
}

export type CommunityScope = 'browse' | 'active' | 'friends' | 'joined'

/** A media item seen as a place people gather, rather than as a catalogue row. */
export interface CommunitySummary {
  media: Media
  memberCount: number
  threadCount: number
  replyCount: number
  /** Whether the viewer has joined. Null when signed out. */
  joined: boolean | null
  lastActivityAt: IsoDateTime | null
  /**
   * Friends of the viewer who are in this community, newest first.
   *
   * Only populated for the `friends` scope -- the other listings would pay a
   * join per row for faces nothing renders. Absent rather than empty, so a
   * consumer can tell "nobody" from "not asked".
   */
  friendMembers?: UserSummary[]
  /** Total friends here, which can exceed `friendMembers.length`. */
  friendCount?: number
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
 * Direct messages (SPEC 12)
 * ------------------------------------------------------------------ */

/**
 * One conversation as the list screen needs it.
 *
 * Viewer-relative, like `FriendshipState`: a conversation has two
 * participants, and what the row has to show is the *other* one. Resolving
 * that here rather than on the client means the API never ships the viewer
 * their own avatar to filter back out.
 */
export interface ConversationSummary {
  id: string
  /** The person on the other side. */
  participant: UserSummary
  /** Null until somebody has said something. */
  lastMessage: MessagePreview | null
  /** Messages from the other person since the viewer last read the thread. */
  unreadCount: number
  /** Ordering key for the list: the last message, or when it was created. */
  lastActivityAt: IsoDateTime
  /**
   * Whether the viewer may still send.
   *
   * False once the friendship ends or either side blocks. History stays
   * readable -- deleting somebody's record of a conversation because they
   * unfriended is not ours to do -- but the composer is closed, and the
   * client needs to know which without trying a send to find out.
   */
  canSend: boolean
}

/** Just enough of the newest message to draw a list row. */
export interface MessagePreview {
  id: string
  /** Truncated server-side; the full body needs the thread. */
  excerpt: string
  senderId: string
  createdAt: IsoDateTime
}

export interface Message {
  id: string
  conversationId: string
  sender: UserSummary
  /**
   * The decrypted body.
   *
   * Stored encrypted (AES-256-GCM) and decrypted at the service boundary, so
   * everything above this line handles plaintext and nothing below it does.
   * Like every other user-generated string in the product this is raw text,
   * escaped at render time and never trusted as HTML (SPEC 39).
   */
  content: string
  createdAt: IsoDateTime
}

/** A thread with its other participant, returned when a conversation opens. */
export interface ConversationDetail {
  id: string
  participant: UserSummary
  canSend: boolean
  createdAt: IsoDateTime
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
  /** For `also_consumed`: how many other people here have finished it. */
  otherCount?: number
  /** For `also_consumed`: a couple of their names, for the sentence. */
  otherNames?: string[]
  threadTitle?: string
  threadId?: string
  badgeName?: string
  excerpt?: string
}

/* ------------------------------------------------------------------ *
 * Presence (SPEC 9, 12)
 * ------------------------------------------------------------------ */

/**
 * Somebody here who has been through this title, and when.
 *
 * The question this answers is not "how many people rated it" -- every
 * catalogue answers that -- but "has anyone else actually been here?" It is a
 * list of people rather than a number on purpose: a count is a statistic, and
 * what somebody holding a book they just bought wants is a person.
 */
export interface Reader {
  user: UserSummary
  /** Finished, or part-way through. Both count as having been here. */
  status: Extract<MediaStatus, 'completed' | 'in_progress'>
  /** When they finished, or when they last touched it if they have not. */
  at: IsoDateTime
  /** Their score, where they left one. */
  score: number | null
  /** True when this person is a friend of the viewer. */
  isFriend: boolean
}

/** Everyone here who has been through a title, and the shape of the crowd. */
export interface Presence {
  /** Finished it. Friends first, then most recent. */
  readers: Reader[]
  /** How many have finished it in total, including those not listed. */
  completedCount: number
  /** How many are part-way through right now. */
  inProgressCount: number
  /** How many of `readers` are friends of the viewer. */
  friendCount: number
}

/* ------------------------------------------------------------------ *
 * Gamification (SPEC 16, 17)
 * ------------------------------------------------------------------ */

export interface Badge {
  id: string
  slug: string
  name: string
  description: string
  /** Emoji fallback, for anywhere the artwork has not loaded or does not exist. */
  icon: string
  /** 1 (first time) to 4 (rare). Drives ordering and which one becomes a title. */
  tier: number
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
  /**
   * English title, as the server composed it.
   *
   * Kept as the fallback and for any non-browser consumer, but the interface
   * should prefer `titleKey`: a server that builds display strings can only
   * ever build them in one language, and these rows were still reading
   * "Trending movies" on a page that was otherwise entirely in Portuguese.
   */
  title: string
  /**
   * Translation key and its parameters, for a client that has locales.
   *
   * The server names *what the row is* and the client decides how to say it,
   * which is the only split that works when the same payload is rendered in
   * three languages.
   */
  titleKey: string
  titleParams?: Record<string, string>
  items: DiscoverItem[]
}

export interface DiscoverItem {
  media: Media
  averageRating: number | null
  ratingCount: number
  /** Friends associated with this item, for 'Friends are watching'. */
  friends: UserSummary[]
  /** Why this was recommended, where something recommended it (SPEC 21). */
  reason?: RecommendationReason | null
}

/**
 * Why a title is on a recommendation rail.
 *
 * Counts and names, never a sentence. The client turns this into "Marina and
 * Leo rated this" or "14 people who share your taste rated this" in whichever
 * of the three languages the reader is using -- a server that builds the
 * string can only build it in one.
 *
 * Both counts can be non-zero at once, and the client leads with friends: a
 * person you know beats a statistic about strangers.
 */
export interface RecommendationReason {
  /** Friends who rated it 4.0 or better. */
  friendCount: number
  /** Up to two of their display names, for the sentence. */
  friendNames: string[]
  /** Members with similar taste who rated it 4.0 or better. */
  neighbourCount: number
}

/* ------------------------------------------------------------------ *
 * The landing screen
 * ------------------------------------------------------------------ */

/**
 * One poster on the "fresh reviews" rail.
 *
 * Deliberately not a `Media`. The rail draws a cover, a title, a type and a
 * year, and shipping a dozen full media objects -- descriptions, metadata
 * blobs and all -- to render a dozen posters is waste the landing screen would
 * pay on every visit.
 */
export interface TrendingTile {
  id: string
  mediaType: MediaType
  title: string
  coverImageUrl: string | null
  /** Already formatted, or empty where the provider supplied no date. */
  releaseYear: string
  /** The community score on the 0.5-5.0 scale, null when nobody has rated it. */
  ratingAverage: number | null
  ratingCount: number
}

/**
 * A real review, short enough to sit on a card.
 *
 * Every field is somebody's actual writing. These cards are the one place the
 * landing screen claims that people are here, and a placeholder quote would
 * make that claim false -- so an empty list is the honest answer before anyone
 * has reviewed anything, and the section renders without cards.
 */
export interface CommunityReview {
  id: string
  author: UserSummary
  /** What is being reviewed. Carried whole, because the Explore card shows
   *  it as a chip you can click rather than as a line of caption. */
  mediaId: string
  mediaTitle: string
  mediaType: MediaType
  coverImageUrl: string | null
  /** Score out of 5, or null when the author wrote without scoring. */
  score: number | null
  /** Trimmed at the API to a card's worth, never the whole review body. */
  quote: string
  likeCount: number
  commentCount: number
  /** ISO, so the card can print "2h ago" against the reader's own clock. */
  createdAt: string
}

/**
 * Everything the landing screen needs in one request.
 *
 * One round trip for four sections. They are all small projections -- a few
 * urls, a few counts, three short quotes -- and splitting them into four
 * endpoints would cost four times the latency to save nothing.
 */
export interface HomeSummary {
  /** Titles the community has reviewed most recently. */
  trending: TrendingTile[]
  /** A few members, for the face pile under the statement. */
  members: UserSummary[]
  /** Real reviews, for the cards in the community section. */
  reviews: CommunityReview[]
  titleCount: number
  memberCount: number
  reviewCount: number
  conversationCount: number
}

/* ------------------------------------------------------------------ *
 * The member dashboard
 * ------------------------------------------------------------------ */

/**
 * The counters in the member's activity panel.
 *
 * Deliberately about what this person has *given* the community and who they
 * are connected to -- not followers and following. RENA's graph is symmetric:
 * friendships, with a request and an accept. A follower count would be a
 * number with no model behind it.
 */
export interface DashboardActivity {
  ratingCount: number
  reviewCount: number
  /** Comments this member has written, across reviews and discussions. */
  commentCount: number
  /** Likes other people have put on this member's reviews. */
  likesReceived: number
  friendCount: number
}

/** Counts beside the library links in the sidebar. */
export interface LibraryCounts {
  /** Planned films and series. */
  watchlist: number
  /** Planned books. */
  readlist: number
  /** Planned games. */
  playlist: number
  reviews: number
  /** Reviews this member has liked. */
  liked: number
  /** Anything finished, of any type. */
  history: number
}

/** A review on the dashboard's "trending reviews" row. */
export interface DashboardReview {
  id: string
  author: UserSummary
  mediaId: string
  mediaTitle: string
  mediaType: MediaType
  coverImageUrl: string | null
  score: number | null
  /**
   * The review's opening sentence, used as a headline.
   *
   * Reviews have no title field and should not grow one -- asking someone for
   * a headline as well as an opinion is how you get fewer opinions. The first
   * sentence is what a writer leads with anyway, so it is promoted rather
   * than invented.
   */
  headline: string
  /** What follows the headline, trimmed to the card. */
  body: string
  likeCount: number
  commentCount: number
  createdAt: IsoDateTime
}

/** A friend, and what they are part-way through. */
export interface FriendActivity {
  user: UserSummary
  mediaId: string
  mediaTitle: string
  mediaType: MediaType
  updatedAt: IsoDateTime
}

/** One row of the "popular right now" chart. */
export interface PopularItem {
  id: string
  title: string
  mediaType: MediaType
  coverImageUrl: string | null
}

/**
 * One "because you liked X" row.
 *
 * The heading says "Because you liked X" and it has to be true. It was not:
 * `anchorTitle` was the most recently liked title while the items were ranked
 * against the pooled genres of *everything* the viewer had ever liked, so the
 * row named one film and answered a question about all of them. The anchor and
 * the items now come from the same query.
 *
 * Several rows rather than one, each on a different anchor -- which is both
 * what Netflix does and the only way a row like this stays interesting past
 * the first visit.
 */
export interface RecommendationRow {
  anchor: PopularItem
  items: RecommendedItem[]
}

export interface RecommendedItem extends PopularItem, CardPreview {
  /**
   * Why this title is in this row, as a key and its parameters.
   *
   * Not a sentence. A server that composes display strings can only compose
   * them in one language, and these rows were reading in English on an
   * otherwise Portuguese screen -- the same mistake the Discover section
   * headings made. The server says what the connection *is*; the client
   * decides how to say it.
   */
  reasonKey: string
  reasonParams: Record<string, string>
}

/**
 * What a card can say about how good something is, and whose opinion it is.
 *
 * Two numbers, never blended. RENA's average is the only one that belongs to
 * this community, and it leads wherever it exists -- but on a catalogue this
 * young most titles have a handful of local ratings or none, and a card that
 * can only say nothing is a dead end. That is what the recommendation rows
 * looked like: "Because you liked Avatar" over six posters with no number on
 * any of them.
 *
 * The provider's score fills that gap and is always attributed, because it is
 * somebody else's number. It also keeps its own scale: TMDB's 8.4 is out of
 * ten and RENA's is out of five, and dividing one by two to fit the stars
 * would present a stranger's opinion as this community's.
 */
export interface CardScore {
  /** RENA's own average, 0.5-5.0. Null when nobody here has rated it. */
  ratingAverage: number | null
  ratingCount: number
  /** The provider's aggregate, normalised to 0-10 and named. */
  externalRating: { source: string; score: number; votes: number } | null
}

/**
 * Everything a card reveals on hover: whose score it is, and what the thing is.
 *
 * A score tells you how good something is and nothing about what it *is*, so
 * a row of posters with numbers on them is still a guessing game for anything
 * whose cover art is not self-explanatory. One line of plot is what turns a
 * poster into a decision.
 */
export interface CardPreview extends CardScore {
  /**
   * A sentence or two, trimmed before it crosses the wire.
   *
   * Trimmed server-side rather than in the component because the source text
   * is not a sentence or two: RAWG's game descriptions average a thousand
   * characters and run to nearly two thousand, and shipping all of that for a
   * caption nobody has hovered yet is most of the payload for none of the
   * value. Null where the provider gave us no text at all.
   */
  blurb: string | null
}

/** Everything the signed-in home screen needs, in one request. */
export interface DashboardSummary {
  activity: DashboardActivity
  library: LibraryCounts
  reviews: DashboardReview[]
  friends: FriendActivity[]
  popular: PopularItem[]
  /** Empty until the viewer has rated something 4.0 or better. */
  recommendations: RecommendationRow[]
}

/* ------------------------------------------------------------------ *
 * The Explore screen
 * ------------------------------------------------------------------ */

/**
 * One card on Explore.
 *
 * Carries both scores. `ratingAverage` is this community's and leads; the
 * provider's sits beside it for the large majority of titles that nobody here
 * has rated yet -- a catalogue card that can only say "no ratings" is a dead
 * end, and the point of Explore is that nothing on it should be.
 */
export interface ExploreCard {
  id: string
  mediaType: MediaType
  title: string
  coverImageUrl: string | null
  releaseYear: string
  /** RENA's own average, 0.5-5.0. Null when nobody here has rated it. */
  ratingAverage: number | null
  ratingCount: number
  reviewCount: number
  /** The provider's aggregate, normalised to 0-10 and attributed. */
  externalRating: { source: string; score: number; votes: number } | null
}

/** A mood row, with the titles that answer it. */
export interface MoodRow {
  key: string
  title: string
  tags: readonly string[]
  items: ExploreCard[]
}

/** Everything the Explore screen shows, in one request. */
export interface ExploreSummary {
  /** "What everyone's talking about" -- most discussed in the recent window. */
  discussed: ExploreCard[]
  /** "You might not know these yet" -- well rated, barely known. */
  gems: ExploreCard[]
  /** Real reviews for the community band. */
  reviews: CommunityReview[]
}

/**
 * One answer to a described request (SPEC 40).
 *
 * An ordinary catalogue card, plus the one thing the card cannot carry: why
 * this title was offered to *this* person for *this* sentence. Extending the
 * card rather than inventing a parallel shape is what lets the existing rows
 * render these without a second component.
 */
export interface DiscoveryResult extends ExploreCard {
  /**
   * One sentence on why this answers what was asked. Written by the model, so
   * it is rendered as text and never as markup.
   */
  because: string
}

/**
 * A question put back to the reader before answering (SPEC 40).
 *
 * "A World War II film" is not a request anybody can answer well -- there are
 * a dozen of them and they have nothing in common but a decade. Asking one
 * thing back is what a person behind a counter would do, and it is cheaper
 * than eight wrong suggestions.
 *
 * `options` are chips, not a closed set: the reader can also type. They exist
 * because the hard part of answering "how heavy do you want it?" is inventing
 * the vocabulary, and a chip supplies it.
 */
export interface DiscoveryQuestion {
  /** One question, in the reader's language. */
  question: string
  /** Suggested answers. The client appends its own "doesn't matter". */
  options: string[]
  /**
   * The axis this question covers -- 'tone', 'length', 'era', 'audience'.
   *
   * A stable English slug, never shown to the reader. It exists so a dimension
   * can be closed once answered: told "a gritty, realistic combat drama", the
   * model would otherwise come back asking "what tone are you after?" and
   * offer that same phrase as its first option. Instructions did not stop it;
   * naming the axis and listing the closed ones does.
   */
  dimension: string
}

/** One question-and-answer already exchanged, oldest first. */
export interface DiscoveryExchange {
  question: string
  answer: string
  /** The axis that question covered, so it is not asked again. */
  dimension?: string
  /**
   * True when the reader pressed "doesn't matter" rather than choosing.
   *
   * A flag rather than matching the answer text, because that text is the
   * localised skip label and string-matching it would work in English and
   * quietly stop working in Portuguese. This is the difference between a
   * reader narrowing their request and a reader declining to, and only the
   * client can tell them apart.
   */
  skipped?: boolean
}

/** Everything the described-request screen shows. */
export interface DiscoveryAnswer {
  /**
   * What the request was understood to mean, shown back to the reader.
   *
   * Present so a misreading is legible. Without it a wrong answer looks like a
   * broken feature rather than a misunderstood sentence, and the reader has no
   * way to tell which -- or how to rephrase.
   */
  understood: string
  results: DiscoveryResult[]
  /** Set when the catalogue genuinely cannot serve the request. */
  nothingFits: string | null
  /**
   * Set when the request was too vague to answer well and there is still
   * question budget left. Mutually exclusive with `results`: a screen that
   * asks a question *and* shows eight answers has not really asked.
   */
  question: DiscoveryQuestion | null
  /** Questions still available after this turn, so the client can say so. */
  questionsLeft: number
}

/**
 * A review rendered into another language (SPEC 31).
 *
 * Carries `from` so the interface can attribute it. A translation shown
 * without naming its source language is just somebody else's words in yours.
 */
export interface ReviewTranslation {
  reviewId: string
  content: string
  from: string
  to: string
  /** True when produced now rather than served from the cache. */
  fresh: boolean
}
