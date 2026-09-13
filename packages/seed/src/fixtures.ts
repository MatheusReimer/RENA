import type { MediaType } from '@revy/shared/types'

/**
 * Development fixtures (SPEC 44).
 *
 * Titles are listed by name and provider id rather than with hardcoded artwork
 * URLs. When TMDB_API_KEY is set the seed pulls real covers, descriptions and
 * runtimes through the same `MediaProvider` abstraction the app uses -- so the
 * seeded database looks like production data and the provider path gets
 * exercised on every fresh setup. Without a key it falls back to these static
 * rows, and the app still runs.
 */

export interface SeedUser {
  username: string
  displayName: string
  email: string
  bio: string
}

/** Every seeded account shares this password. Development only. */
export const SEED_PASSWORD = 'password123'

export const SEED_USERS: SeedUser[] = [
  {
    username: 'matheusr',
    displayName: 'Matheus',
    email: 'matheus@example.com',
    bio: 'Movies, books and good stories. Always looking for what is next.',
  },
  {
    username: 'pedrofs',
    displayName: 'Pedro',
    email: 'pedro@example.com',
    bio: 'Sci-fi apologist. Will defend the theatrical cut.',
  },
  {
    username: 'marinar',
    displayName: 'Marina',
    email: 'marina@example.com',
    bio: 'Reading more than watching this year.',
  },
  {
    username: 'lucaszg',
    displayName: 'Lucas',
    email: 'lucas@example.com',
    bio: 'Slow burns and long books.',
  },
  {
    username: 'juliam',
    displayName: 'Julia',
    email: 'julia@example.com',
    bio: 'Animation is not a genre.',
  },
  {
    username: 'rafacc',
    displayName: 'Rafa',
    email: 'rafa@example.com',
    bio: 'Three episodes in and already invested.',
  },
  {
    username: 'anacl',
    displayName: 'Ana',
    email: 'ana@example.com',
    bio: 'Documentaries, mostly. Occasionally a thriller.',
  },
  {
    username: 'brunop',
    displayName: 'Bruno',
    email: 'bruno@example.com',
    bio: 'I rate harshly and I am sorry about it.',
  },
  {
    username: 'carolm',
    displayName: 'Carol',
    email: 'carol@example.com',
    bio: 'Rewatching everything I loved at twenty.',
  },
  {
    username: 'diegol',
    displayName: 'Diego',
    email: 'diego@example.com',
    bio: 'Book first, always.',
  },
]

export interface SeedMedia {
  /** Search term used to hydrate real metadata when a provider key is set. */
  query: string
  mediaType: MediaType
  /** Stable fallback id, used when no provider is configured. */
  fallbackExternalId: string
  title: string
  description: string
  releaseDate: string
  metadata: Record<string, unknown>
}

export const SEED_MEDIA: SeedMedia[] = [
  {
    query: 'Dune Part Two',
    mediaType: 'movie',
    fallbackExternalId: 'seed-dune-part-two',
    title: 'Dune: Part Two',
    description:
      'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
    releaseDate: '2024-02-27',
    metadata: { genres: ['Sci-Fi', 'Drama'], runtimeMinutes: 166 },
  },
  {
    query: 'Dune 2021',
    mediaType: 'movie',
    fallbackExternalId: 'seed-dune',
    title: 'Dune',
    description:
      'A noble family becomes embroiled in a war for control over the most valuable asset in the galaxy.',
    releaseDate: '2021-09-15',
    metadata: { genres: ['Sci-Fi', 'Adventure'], runtimeMinutes: 155 },
  },
  {
    query: 'Interstellar',
    mediaType: 'movie',
    fallbackExternalId: 'seed-interstellar',
    title: 'Interstellar',
    description:
      'A team of explorers travel through a wormhole in an attempt to ensure the survival of humanity.',
    releaseDate: '2014-11-05',
    metadata: { genres: ['Sci-Fi', 'Drama'], runtimeMinutes: 169 },
  },
  {
    query: 'Blade Runner 2049',
    mediaType: 'movie',
    fallbackExternalId: 'seed-blade-runner-2049',
    title: 'Blade Runner 2049',
    description:
      'A young blade runner uncovers a secret that leads him to track down a former blade runner missing for thirty years.',
    releaseDate: '2017-10-04',
    metadata: { genres: ['Sci-Fi', 'Mystery'], runtimeMinutes: 164 },
  },
  {
    query: 'Arrival',
    mediaType: 'movie',
    fallbackExternalId: 'seed-arrival',
    title: 'Arrival',
    description:
      'A linguist is recruited by the military to communicate with alien lifeforms after twelve craft appear worldwide.',
    releaseDate: '2016-11-10',
    metadata: { genres: ['Sci-Fi', 'Drama'], runtimeMinutes: 116 },
  },
  {
    query: 'Oppenheimer',
    mediaType: 'movie',
    fallbackExternalId: 'seed-oppenheimer',
    title: 'Oppenheimer',
    description:
      'The story of J. Robert Oppenheimer and his role in the development of the atomic bomb.',
    releaseDate: '2023-07-19',
    metadata: { genres: ['Drama', 'History'], runtimeMinutes: 181 },
  },
  {
    query: 'Everything Everywhere All at Once',
    mediaType: 'movie',
    fallbackExternalId: 'seed-eeaao',
    title: 'Everything Everywhere All at Once',
    description:
      'A laundromat owner is swept into an adventure across parallel universes to save existence.',
    releaseDate: '2022-03-24',
    metadata: { genres: ['Sci-Fi', 'Comedy'], runtimeMinutes: 139 },
  },
  {
    query: 'Parasite',
    mediaType: 'movie',
    fallbackExternalId: 'seed-parasite',
    title: 'Parasite',
    description:
      'Greed and class discrimination threaten the newly formed symbiotic relationship between two families.',
    releaseDate: '2019-05-30',
    metadata: { genres: ['Thriller', 'Drama'], runtimeMinutes: 133 },
  },
  {
    query: 'Past Lives',
    mediaType: 'movie',
    fallbackExternalId: 'seed-past-lives',
    title: 'Past Lives',
    description:
      'Two childhood friends reunite in New York two decades after being separated.',
    releaseDate: '2023-06-02',
    metadata: { genres: ['Romance', 'Drama'], runtimeMinutes: 105 },
  },
  {
    query: 'The Last of Us',
    mediaType: 'series',
    fallbackExternalId: 'seed-the-last-of-us',
    title: 'The Last of Us',
    description:
      'Twenty years after civilisation collapsed, a smuggler is tasked with escorting a teenage girl out of a quarantine zone.',
    releaseDate: '2023-01-15',
    metadata: { genres: ['Drama', 'Sci-Fi'], seasonCount: 2, runtimeMinutes: 55 },
  },
  {
    query: 'Arcane',
    mediaType: 'series',
    fallbackExternalId: 'seed-arcane',
    title: 'Arcane',
    description:
      'Two sisters end up on opposite sides of a war between the utopia of Piltover and the underbelly of Zaun.',
    releaseDate: '2021-11-06',
    metadata: { genres: ['Animation', 'Drama'], seasonCount: 2, runtimeMinutes: 42 },
  },
  {
    query: 'Severance',
    mediaType: 'series',
    fallbackExternalId: 'seed-severance',
    title: 'Severance',
    description:
      'Employees undergo a procedure that surgically divides their memories between work and personal life.',
    releaseDate: '2022-02-18',
    metadata: { genres: ['Thriller', 'Sci-Fi'], seasonCount: 2, runtimeMinutes: 50 },
  },
  {
    query: 'Chernobyl',
    mediaType: 'series',
    fallbackExternalId: 'seed-chernobyl',
    title: 'Chernobyl',
    description:
      'A dramatisation of the 1986 nuclear accident and the sacrifices made to contain it.',
    releaseDate: '2019-05-06',
    metadata: { genres: ['Drama', 'History'], seasonCount: 1, runtimeMinutes: 65 },
  },
  {
    query: 'The Bear',
    mediaType: 'series',
    fallbackExternalId: 'seed-the-bear',
    title: 'The Bear',
    description:
      'A young chef returns to Chicago to run his family sandwich shop after a death in the family.',
    releaseDate: '2022-06-23',
    metadata: { genres: ['Drama', 'Comedy'], seasonCount: 4, runtimeMinutes: 30 },
  },
  {
    query: 'Shogun 2024',
    mediaType: 'series',
    fallbackExternalId: 'seed-shogun',
    title: 'Shōgun',
    description:
      'In feudal Japan, a English navigator becomes entangled in a violent contest for power.',
    releaseDate: '2024-02-27',
    metadata: { genres: ['Drama', 'History'], seasonCount: 1, runtimeMinutes: 60 },
  },
  {
    query: 'Sapiens A Brief History of Humankind',
    mediaType: 'book',
    fallbackExternalId: 'seed-sapiens',
    title: 'Sapiens: A Brief History of Humankind',
    description: '',
    releaseDate: '2011-01-01',
    metadata: { authors: ['Yuval Noah Harari'], pageCount: 443 },
  },
  {
    query: 'Project Hail Mary',
    mediaType: 'book',
    fallbackExternalId: 'seed-project-hail-mary',
    title: 'Project Hail Mary',
    description: '',
    releaseDate: '2021-05-04',
    metadata: { authors: ['Andy Weir'], pageCount: 476 },
  },
  {
    query: 'Dune Frank Herbert',
    mediaType: 'book',
    fallbackExternalId: 'seed-dune-book',
    title: 'Dune',
    description: '',
    releaseDate: '1965-08-01',
    metadata: { authors: ['Frank Herbert'], pageCount: 412 },
  },
  {
    query: 'The Three-Body Problem',
    mediaType: 'book',
    fallbackExternalId: 'seed-three-body',
    title: 'The Three-Body Problem',
    description: '',
    releaseDate: '2008-01-01',
    metadata: { authors: ['Liu Cixin'], pageCount: 400 },
  },
  {
    query: 'Piranesi Susanna Clarke',
    mediaType: 'book',
    fallbackExternalId: 'seed-piranesi',
    title: 'Piranesi',
    description: '',
    releaseDate: '2020-09-15',
    metadata: { authors: ['Susanna Clarke'], pageCount: 245 },
  },
]

/** Review bodies, paired to titles by index at seed time. */
export const SEED_REVIEWS: string[] = [
  'Absolute cinema. Villeneuve is on another level, and the sound design alone is worth the ticket.',
  'Incredible how relevant this still is today. I kept stopping to think about the chapter on agriculture.',
  'The second half earns everything the first half sets up. Patient, and completely worth it.',
  'Beautiful to look at, and genuinely moving once it stops trying to be clever.',
  'I wanted to love this more than I did. Gorgeous, but it kept me at a distance throughout.',
  'Watched it twice in a week. The structure is doing so much more than it first appears.',
  'Not a single wasted scene. Rare for something this long.',
  'The performances carry it. I would watch these two read a phone book.',
  'Started slow for me, then completely took over my week.',
  'A book I will be thinking about for a long time. The ending reframes everything.',
]

/** Discussion prompts, seeded against the first few media items. */
export const SEED_THREADS: Array<{ title: string; spoiler: boolean }> = [
  { title: 'Is the second movie better than the first?', spoiler: false },
  { title: 'Should I read the book before watching?', spoiler: false },
  { title: 'Thoughts on the ending (spoilers)', spoiler: true },
  { title: 'Soundtrack appreciation thread', spoiler: false },
  { title: 'What did everyone make of the pacing?', spoiler: false },
]

export const SEED_COMMENTS: string[] = [
  'The first one had more to prove, but the second is a better film start to finish.',
  'Read it first. The film assumes you know the world already.',
  'Completely disagree, but I respect it.',
  'The score has been in my head for a week.',
  'It drags in the middle third and I will die on this hill.',
  'This is the take I needed to see. Thank you.',
]

export const SEED_LISTS: Array<{ name: string; description: string; visibility: 'private' | 'friends' | 'public' }> = [
  { name: 'Favorites', description: 'The ones I keep coming back to.', visibility: 'public' },
  { name: 'Sci-Fi Essentials', description: 'Where to start.', visibility: 'public' },
  { name: 'To Watch', description: '', visibility: 'private' },
  { name: 'To Read', description: 'The pile.', visibility: 'friends' },
  { name: '2024 Highlights', description: 'Best of the year.', visibility: 'public' },
]
