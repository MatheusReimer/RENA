/**
 * Media types supported by the domain.
 *
 * Adding a type here is deliberately cheap: the `media` table is generic and
 * ratings/reviews/lists/discussions all reference it (SPEC 7, 49.3, 49.11).
 * Games are explicitly out of scope for the MVP (SPEC 1).
 */
export const MEDIA_TYPES = ['movie', 'series', 'book'] as const

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
} as const

/** Short singular noun for a media type, used in headings and chips. */
export const MEDIA_TYPE_LABELS = {
  movie: 'Movie',
  series: 'Series',
  book: 'Book',
} as const

/** Verb used when describing consumption in activity copy. */
export const MEDIA_TYPE_VERBS = {
  movie: { present: 'watching', past: 'watched' },
  series: { present: 'watching', past: 'watched' },
  book: { present: 'reading', past: 'read' },
} as const
