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
] as const
