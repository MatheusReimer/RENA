/**
 * Content length limits, enforced server-side by the Zod schemas (SPEC 25).
 * Clients reuse these for character counters so the two never drift.
 */
export const LIMITS = {
  username: { min: 3, max: 30 },
  displayName: { min: 1, max: 50 },
  bio: { max: 280 },
  reviewContent: { min: 1, max: 5000 },
  discussionTitle: { min: 5, max: 200 },
  commentContent: { min: 1, max: 3000 },
  listName: { min: 1, max: 100 },
  listDescription: { max: 500 },
  searchQuery: { min: 1, max: 100 },
} as const

/** Maximum depth for nested discussion replies (SPEC 14). */
export const COMMENT_MAX_DEPTH = 5

/**
 * Reserved usernames that would collide with routes or impersonate the product.
 * Checked case-insensitively at signup.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  'admin', 'administrator', 'api', 'auth', 'settings', 'support', 'help',
  'about', 'terms', 'privacy', 'login', 'logout', 'signup', 'register',
  'search', 'discover', 'feed', 'home', 'profile', 'notifications',
  'lists', 'media', 'movie', 'series', 'book', 'user', 'users',
  'revy', 'vybe', 'staff', 'team', 'official', 'root', 'system', 'me', 'null',
]
