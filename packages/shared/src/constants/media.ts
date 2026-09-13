/**
 * Media types supported by the domain.
 *
 * Adding a type here is deliberately cheap: the `media` table is generic and
 * ratings/reviews/lists/discussions all reference it (SPEC 7, 49.3, 49.11).
 *
 * Games were out of scope for the MVP (SPEC 1) and were added afterwards --
 * which is the test that design was meant to pass. It cost one enum value, the
 * label sets below, one provider and one badge. No new tables, and nothing in
 * ratings, reviews, lists, discussions or the feed changed.
 */
export const MEDIA_TYPES = ['movie', 'series', 'book', 'game'] as const

/**
 * Consumption status, stored generically for every media type (SPEC 9).
 * The UI relabels these per media type via `MEDIA_STATUS_LABELS`.
 */
export const MEDIA_STATUSES = ['planned', 'in_progress', 'completed', 'dropped'] as const

/**
 * Per-type wording for each status. The underlying model stays generic;
 * only the label changes between a movie and a book (SPEC 9).
 */
export const MEDIA_STATUS_LABELS = {
  movie: {
    planned: 'Want to watch',
    in_progress: 'Watching',
    completed: 'Watched',
    dropped: 'Dropped',
  },
  series: {
    planned: 'Want to watch',
    in_progress: 'Watching',
    completed: 'Watched',
    dropped: 'Dropped',
  },
  book: {
    planned: 'Want to read',
    in_progress: 'Reading',
    completed: 'Read',
    dropped: 'Dropped',
  },
  game: {
    planned: 'Want to play',
    in_progress: 'Playing',
    completed: 'Played',
    dropped: 'Dropped',
  },
} as const

/** Short singular noun for a media type, used in headings and chips. */
export const MEDIA_TYPE_LABELS = {
  movie: 'Movie',
  series: 'Series',
  book: 'Book',
  game: 'Game',
} as const

/**
 * Plural forms, for headings like "Trending series".
 *
 * Spelled out rather than derived, because appending an "s" produces
 * "seriess" -- and English will keep finding ways to punish that assumption.
 */
export const MEDIA_TYPE_PLURALS = {
  movie: 'Movies',
  series: 'Series',
  book: 'Books',
  game: 'Games',
} as const

/** Verb used when describing consumption in activity copy. */
export const MEDIA_TYPE_VERBS = {
  movie: { present: 'watching', past: 'watched' },
  series: { present: 'watching', past: 'watched' },
  book: { present: 'reading', past: 'read' },
  game: { present: 'playing', past: 'played' },
} as const
