import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

// The single .env lives at the repo root, but pnpm runs this script with the
// package as cwd, so dotenv needs an explicit path rather than its default.
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

import { badgeService, createProviderRegistry, type ProviderRegistry } from '@revy/core'
import {
  createDatabase,
  embeddedDataDir,
  isEmbedded,
  toAbsoluteEmbeddedUrl,
  type Database,
} from '@revy/db'
import { schema } from '@revy/db'
import { hashPassword } from 'better-auth/crypto'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import {
  SEED_COMMENTS,
  SEED_LISTS,
  SEED_MEDIA,
  SEED_PASSWORD,
  SEED_REVIEWS,
  SEED_THREADS,
  SEED_USERS,
  type SeedMedia,
} from './fixtures'

/**
 * Development seed (SPEC 44).
 *
 * Produces a database that is immediately useful to look at: ten users who are
 * friends with each other, twenty titles, and enough ratings, reviews,
 * discussions and lists that every screen has real content on it.
 *
 * Lives in its own package rather than in @revy/db, because it needs both the
 * schema and the services -- and @revy/core already depends on @revy/db, so
 * putting it there would make the package graph circular.
 *
 * Run with: pnpm db:seed
 */

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.error(
    '\n  DATABASE_URL is not set.\n' +
      '  Copy .env.example to .env at the repo root and add your connection string.\n',
  )
  process.exit(1)
}

/**
 * Deterministic pseudo-randomness.
 *
 * A fixed seed means every developer and every CI run gets the same ratings,
 * so "the average on Dune changed" is a real signal rather than noise.
 */
let rngState = 42
function random(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296
  return rngState / 4294967296
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!
}

/** A score from 2.5 to 5.0, in half-steps, weighted to the upper half. */
function randomHalfSteps(): number {
  return 5 + Math.floor(random() * 6)
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/** Resolved relative to this file so the script works from any cwd. */
const MIGRATIONS_DIR = fileURLToPath(new URL('../../db/migrations', import.meta.url))

type SeededUser = { id: string; username: string }
type SeededMedia = { id: string }

async function main() {
  // Made absolute against the repo root so the seed and the dev server always
  // open the same data directory, whatever their working directory is.
  const url = toAbsoluteEmbeddedUrl(
    connectionString!,
    fileURLToPath(new URL('../../..', import.meta.url)),
  )
  const db = createDatabase({ connectionString: url, maxConnections: 1 })

  console.log('\n  Seeding database...\n')

  if (isEmbedded(url)) {
    // drizzle-kit cannot reach the embedded database -- it opens its own
    // connection and PGlite allows exactly one -- so migrations are applied
    // programmatically here. A real Postgres uses `pnpm db:migrate` instead.
    console.log(`  Embedded Postgres at ${embeddedDataDir(url)} - applying migrations`)
    const { migrate } = await import('drizzle-orm/pglite/migrator')
    await migrate(db as never, { migrationsFolder: MIGRATIONS_DIR })
  }

  await clear(db)

  await badgeService.syncCatalogue(db)
  const badges = await db.select({ id: schema.badges.id }).from(schema.badges)
  console.log(`  ${badges.length} badges`)

  const users = await seedUsers(db)
  console.log(`  ${users.length} users`)

  const media = await seedMedia(db)
  console.log(`  ${media.length} media items`)

  const friendships = await seedFriendships(db, users)
  console.log(`  ${friendships} friendships`)

  const { ratings, reviews } = await seedRatingsAndReviews(db, users, media)
  console.log(`  ${ratings} ratings, ${reviews} reviews`)

  await seedDiscussions(db, users, media)
  console.log(`  ${SEED_THREADS.length} discussion threads`)

  await seedLists(db, users, media)
  console.log(`  ${SEED_LISTS.length} lists`)

  const memberships = await seedCommunities(db, users, media)
  console.log(`  ${memberships} community memberships`)

  console.log('\n  Done. Sign in with any of these:\n')
  for (const user of SEED_USERS.slice(0, 3)) {
    console.log(`    ${user.email.padEnd(24)} ${SEED_PASSWORD}`)
  }
  console.log('')

  process.exit(0)
}

/**
 * Clears seeded data.
 *
 * One TRUNCATE ... CASCADE rather than ordered DELETEs: the foreign key graph
 * is deep enough that a hand-maintained delete order would silently rot as
 * tables are added.
 */
async function clear(db: Database) {
  await db.execute(sql`
    TRUNCATE TABLE
      activities, activity_likes, notifications,
      discussion_comments, discussion_threads, review_comments,
      community_members,
      list_items, lists,
      reviews, review_likes, ratings,
      user_media, media_rating_stats, media,
      friendships, user_badges, user_xp, users,
      auth_session, auth_account, auth_verification, auth_user
    RESTART IDENTITY CASCADE
  `)
}

async function seedUsers(db: Database): Promise<SeededUser[]> {
  // Hashed with Better Auth's own function, so seeded accounts sign in through
  // the normal flow rather than being display-only fixtures.
  const passwordHash = await hashPassword(SEED_PASSWORD)

  const created: SeededUser[] = []

  for (const user of SEED_USERS) {
    const authUserId = randomUUID()

    await db.insert(schema.authUser).values({
      id: authUserId,
      name: user.displayName,
      email: user.email,
      emailVerified: true,
    })

    await db.insert(schema.authAccount).values({
      id: randomUUID(),
      accountId: authUserId,
      providerId: 'credential',
      userId: authUserId,
      password: passwordHash,
    })

    const [row] = await db
      .insert(schema.users)
      .values({
        authUserId,
        username: user.username,
        displayName: user.displayName,
        bio: user.bio,
      })
      .returning({ id: schema.users.id, username: schema.users.username })

    created.push(row!)
  }

  return created
}

async function seedMedia(db: Database): Promise<SeededMedia[]> {
  const tmdbApiKey = process.env.TMDB_API_KEY

  // Hydrating through the real provider gives the seeded database genuine
  // artwork and descriptions, and exercises the provider path on every setup.
  const registry = createProviderRegistry({ tmdbApiKey: tmdbApiKey || undefined })

  if (!tmdbApiKey) {
    console.log('  (TMDB_API_KEY not set - movies and series seed without cover art)')
  }

  const created: SeededMedia[] = []

  for (const item of SEED_MEDIA) {
    const hydrated = await hydrate(registry, item)

    const [row] = await db
      .insert(schema.media)
      .values({
        externalId: hydrated?.externalId ?? item.fallbackExternalId,
        provider: hydrated?.provider ?? 'seed',
        mediaType: item.mediaType,
        title: hydrated?.title ?? item.title,
        originalTitle: hydrated?.originalTitle ?? null,
        description: hydrated?.description ?? (item.description || null),
        releaseDate: hydrated?.releaseDate ?? item.releaseDate,
        coverImageUrl: hydrated?.coverImageUrl ?? null,
        backdropImageUrl: hydrated?.backdropImageUrl ?? null,
        metadata: hydrated?.metadata ?? item.metadata,
        syncedAt: hydrated ? new Date() : null,
      })
      .returning({ id: schema.media.id })

    created.push(row!)
  }

  return created
}

/** Looks a title up through the provider registry, tolerating failure. */
async function hydrate(registry: ProviderRegistry, item: SeedMedia) {
  try {
    const provider = registry.forType(item.mediaType)
    if (!provider) return null

    const { results } = await registry.searchAll(item.query, 1, item.mediaType)
    const match = results[0]
    if (!match) return null

    return await provider.getByExternalId(match.externalId, item.mediaType)
  } catch {
    // A provider hiccup should degrade the seed, not fail it.
    return null
  }
}

/**
 * Builds a connected friend graph.
 *
 * The first user is friends with nearly everyone, so the demo account has a
 * full feed on first load. The last two requests stay pending so the requests
 * tab has something in it.
 */
async function seedFriendships(db: Database, users: SeededUser[]): Promise<number> {
  const rows: Array<typeof schema.friendships.$inferInsert> = []
  const hero = users[0]!

  for (let i = 1; i < users.length; i++) {
    rows.push({
      requesterId: hero.id,
      receiverId: users[i]!.id,
      status: i < users.length - 2 ? 'accepted' : 'pending',
    })
  }

  for (let i = 1; i < users.length - 1; i += 2) {
    rows.push({
      requesterId: users[i]!.id,
      receiverId: users[i + 1]!.id,
      status: 'accepted',
    })
  }

  await db.insert(schema.friendships).values(rows).onConflictDoNothing()
  return rows.length
}

async function seedRatingsAndReviews(
  db: Database,
  users: SeededUser[],
  media: SeededMedia[],
) {
  let ratingCount = 0
  let reviewCount = 0
  let reviewIndex = 0

  for (const user of users) {
    for (const item of media) {
      // Each user rates roughly 60% of the catalogue.
      if (random() > 0.6) continue

      const halfSteps = randomHalfSteps()
      const createdAt = daysAgo(Math.floor(random() * 45))

      const [rating] = await db
        .insert(schema.ratings)
        .values({ userId: user.id, mediaId: item.id, score: halfSteps, createdAt })
        .onConflictDoNothing()
        .returning({ id: schema.ratings.id })

      if (!rating) continue
      ratingCount++

      await db.insert(schema.userMedia).values({
        userId: user.id,
        mediaId: item.id,
        status: random() > 0.25 ? 'completed' : 'in_progress',
        startedAt: createdAt,
        completedAt: random() > 0.25 ? createdAt : null,
      })

      // About a fifth of ratings also carry a review.
      let reviewId: string | null = null

      if (random() > 0.8) {
        const [review] = await db
          .insert(schema.reviews)
          .values({
            userId: user.id,
            mediaId: item.id,
            ratingId: rating.id,
            content: SEED_REVIEWS[reviewIndex++ % SEED_REVIEWS.length]!,
            spoiler: random() > 0.85,
            createdAt,
          })
          .onConflictDoNothing()
          .returning({ id: schema.reviews.id })

        if (review) {
          reviewId = review.id
          reviewCount++
        }
      }

      await db.insert(schema.activities).values({
        userId: user.id,
        type: reviewId ? 'reviewed_media' : 'rated_media',
        mediaId: item.id,
        ratingId: rating.id,
        reviewId,
        createdAt,
        likeCount: Math.floor(random() * 30),
      })

      const xp = reviewId ? 20 : 5
      await db
        .insert(schema.userXp)
        .values({ userId: user.id, totalXp: xp })
        .onConflictDoUpdate({
          target: schema.userXp.userId,
          set: { totalXp: sql`${schema.userXp.totalXp} + ${xp}` },
        })
    }
  }

  // Rebuild the denormalised aggregates once from the rows we just wrote,
  // rather than maintaining them incrementally through thousands of inserts.
  //
  // Totals and the histogram are computed in two separate groupings and then
  // joined. Deriving the totals from the already-grouped histogram rows is the
  // obvious shortcut and it is wrong: count(*) would count distinct scores
  // rather than ratings, and sum(score) would ignore how many people gave each
  // score.
  await db.execute(sql`
    INSERT INTO media_rating_stats (media_id, rating_count, rating_sum, distribution)
    SELECT totals.media_id, totals.rating_count, totals.rating_sum, histogram.distribution
    FROM (
      SELECT
        media_id,
        count(*)::int AS rating_count,
        sum(score)::int AS rating_sum
      FROM ratings
      GROUP BY media_id
    ) totals
    JOIN (
      SELECT media_id, jsonb_object_agg(score::text, n) AS distribution
      FROM (
        SELECT media_id, score, count(*)::int AS n
        FROM ratings
        GROUP BY media_id, score
      ) buckets
      GROUP BY media_id
    ) histogram ON histogram.media_id = totals.media_id
    ON CONFLICT (media_id) DO UPDATE SET
      rating_count = EXCLUDED.rating_count,
      rating_sum = EXCLUDED.rating_sum,
      distribution = EXCLUDED.distribution
  `)

  return { ratings: ratingCount, reviews: reviewCount }
}

/**
 * Community memberships (SPEC 14).
 *
 * Seeded against the titles that already have discussions, so the Community
 * screen opens with places that are actually alive rather than a list of
 * empty rooms.
 */
async function seedCommunities(
  db: Database,
  users: SeededUser[],
  media: SeededMedia[],
): Promise<number> {
  const withThreads = await db
    .selectDistinct({ mediaId: schema.discussionThreads.mediaId })
    .from(schema.discussionThreads)

  const targets = withThreads.length > 0
    ? withThreads.map((row) => row.mediaId)
    : media.slice(0, 5).map((item) => item.id)

  const rows: Array<typeof schema.communityMembers.$inferInsert> = []

  for (const mediaId of targets) {
    // Most people, but not everyone -- a full house on every title reads as
    // fake and hides the Join button in every screenshot.
    for (const user of users) {
      if (random() > 0.65) continue
      rows.push({ mediaId, userId: user.id, joinedAt: daysAgo(Math.floor(random() * 30)) })
    }
  }

  if (rows.length === 0) return 0

  await db.insert(schema.communityMembers).values(rows).onConflictDoNothing()
  return rows.length
}

async function seedDiscussions(db: Database, users: SeededUser[], media: SeededMedia[]) {
  let commentIndex = 0

  for (let i = 0; i < SEED_THREADS.length; i++) {
    const thread = SEED_THREADS[i]!
    const item = media[i % media.length]!

    const [created] = await db
      .insert(schema.discussionThreads)
      .values({
        mediaId: item.id,
        userId: pick(users).id,
        title: thread.title,
        spoiler: thread.spoiler,
        createdAt: daysAgo(Math.floor(random() * 20) + 1),
      })
      .returning({ id: schema.discussionThreads.id })

    if (!created) continue

    const replyCount = 2 + Math.floor(random() * 4)
    for (let r = 0; r < replyCount; r++) {
      await db.insert(schema.discussionComments).values({
        threadId: created.id,
        userId: pick(users).id,
        content: SEED_COMMENTS[commentIndex++ % SEED_COMMENTS.length]!,
        depth: 0,
        createdAt: daysAgo(Math.floor(random() * 10)),
      })
    }

    await db
      .update(schema.discussionThreads)
      .set({ replyCount, lastActivityAt: daysAgo(Math.floor(random() * 5)) })
      .where(eq(schema.discussionThreads.id, created.id))
  }
}

async function seedLists(db: Database, users: SeededUser[], media: SeededMedia[]) {
  const hero = users[0]!

  for (const list of SEED_LISTS) {
    const [created] = await db
      .insert(schema.lists)
      .values({
        userId: hero.id,
        name: list.name,
        description: list.description || null,
        visibility: list.visibility,
      })
      .returning({ id: schema.lists.id })

    if (!created) continue

    const size = 3 + Math.floor(random() * 5)
    const chosen = [...media].sort(() => random() - 0.5).slice(0, size)

    for (let i = 0; i < chosen.length; i++) {
      await db
        .insert(schema.listItems)
        .values({
          listId: created.id,
          mediaId: chosen[i]!.id,
          // Sparse positions, so a reorder rewrites one row rather than all.
          position: (i + 1) * 1000,
        })
        .onConflictDoNothing()
    }

    await db
      .update(schema.lists)
      .set({ itemCount: chosen.length })
      .where(eq(schema.lists.id, created.id))
  }
}

main().catch((error) => {
  console.error('\n  Seed failed:\n', error, '\n')
  process.exit(1)
})
