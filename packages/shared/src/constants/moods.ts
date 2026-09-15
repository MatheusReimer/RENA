import type { MediaType } from '../types/domain'

/**
 * Moods: the editorial way into the catalogue (SPEC 21).
 *
 * "What are you in the mood for" is the question somebody asks when they do
 * not know what they want, which is most of the time and the one question a
 * list of genres cannot answer. Nobody is in the mood for "Drama".
 *
 * Each mood is a set of genres the providers already give us, not a column on
 * `media`. That is the whole design: adding a mood is a few lines here, and
 * removing one that turns out to be a bad idea costs nothing. A `mood` column
 * would mean a migration, a backfill, and a decision about who classifies the
 * twelve thousandth title.
 *
 * Genre names are spelled as each provider spells them, which is why the lists
 * look redundant -- TMDB says "Science Fiction" for film and "Sci-Fi & Fantasy"
 * for television, and IGDB says "Role-playing (RPG)". Matching is exact, so a
 * near-miss silently empties a row.
 */
export interface Mood {
  /** Stable key, used in URLs. Never rename one in place. */
  key: string
  /** The question, as a person would ask it. */
  title: string
  /** Three words under the title, setting the register. */
  tags: readonly [string, string, string]
  /** Genres, as the providers spell them. */
  genres: readonly string[]
  /**
   * Types this mood is limited to, or null for all of them.
   *
   * "One more episode" is about television and nothing else; offering a novel
   * under it would be a joke at the reader's expense.
   */
  mediaTypes: readonly MediaType[] | null
}

export const MOODS: readonly Mood[] = [
  {
    key: 'stays-with-you',
    title: 'Something that stays with you',
    tags: ['Emotional', 'Meaningful', 'Lasting'],
    genres: ['Drama', 'History', 'War', 'War & Politics', 'Biography', 'Western'],
    mediaTypes: null,
  },
  {
    key: 'disappear-into',
    title: 'A world to disappear into',
    tags: ['Immersive', 'Expansive', 'Unforgettable'],
    genres: [
      'Fantasy',
      'Science Fiction',
      'Sci-Fi & Fantasy',
      'Adventure',
      'Role-playing (RPG)',
      'Simulator',
    ],
    mediaTypes: null,
  },
  {
    key: 'make-me-think',
    title: 'Make me think',
    tags: ['Thought-provoking', 'Deep', 'Different'],
    genres: ['Documentary', 'Mystery', 'Puzzle', 'Strategy', 'Visual Novel', 'History'],
    mediaTypes: null,
  },
  {
    key: 'good-cry',
    title: 'I need a good cry',
    tags: ['Heartfelt', 'Emotional', 'Human'],
    genres: ['Drama', 'Romance', 'Family', 'Music'],
    mediaTypes: null,
  },
  {
    key: 'one-more-episode',
    title: 'One more episode',
    tags: ['Addictive', 'Bingeworthy', "Can't stop"],
    genres: ['Crime', 'Mystery', 'Thriller', 'Action & Adventure', 'Drama', 'Soap'],
    // Television only. The phrase means nothing about a novel or a game.
    mediaTypes: ['series'],
  },
  {
    key: 'something-weird',
    title: 'Something weird',
    tags: ['Unusual', 'Wild', 'Unexpected'],
    genres: ['Horror', 'Indie', 'Animation', 'Point-and-click', 'Arcade', 'Comedy'],
    mediaTypes: null,
  },
] as const

/** Looks a mood up by its key, or null when the key is not one of ours. */
export function findMood(key: string | null | undefined): Mood | null {
  if (!key) return null
  return MOODS.find((mood) => mood.key === key) ?? null
}
