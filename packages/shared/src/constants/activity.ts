/** Activity feed event types (SPEC 13). */
export const ACTIVITY_TYPES = [
  'rated_media',
  'reviewed_media',
  'completed_media',
  'added_to_list',
] as const

/** Notification types (SPEC 23). Extensible by design. */
export const NOTIFICATION_TYPES = [
  'friend_request',
  'friend_request_accepted',
  'comment_on_review',
  'reply_to_discussion',
  'liked_review',
  'mentioned',
  'badge_earned',
  /**
   * "You are not the first."
   *
   * Sent to the person who has just finished something, naming others here who
   * have been through it before them. Deliberately one notification to one
   * person rather than a broadcast to everyone who has read the book: the
   * moment worth having is arriving somewhere and finding company, not being
   * told every time a stranger turns up behind you.
   */
  'also_consumed',
] as const
