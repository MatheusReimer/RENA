import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'

// The single .env lives at the repo root, but pnpm runs this script with the
// package as cwd, so dotenv needs an explicit path rather than its default.
loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) })

import { badgeService } from '@revy/core'
import {
  createDatabase,
  embeddedDataDir,
  isEmbedded,
  toAbsoluteEmbeddedUrl,
  type Database,
} from '@revy/db'
import { schema } from '@revy/db'
import { MEDIA_TYPES } from '@revy/shared/constants'
import { hashPassword } from 'better-auth/crypto'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import {
  SEED_COMMENTS,
  SEED_LISTS,
  SEED_PASSWORD,
  SEED_REVIEWS,
  SEED_THREADS,
  SEED_USERS,
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
type SeededMedia = {
  id: string
  mediaType: string
  episodeCount?: number
  pageCount?: number
}

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

  const media = await pickCatalogue(db, 60)

  if (media.length === 0) {
    console.error(
      '\n  The catalogue is empty, so there is nothing to rate.' +
        '\n  Run `pnpm db:import` first, then seed again.\n',
    )
    process.exit(1)
  }

  console.log(`  ${media.length} catalogue titles selected`)

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
 * Clears seeded data, but never the catalogue.
 *
 * `media` is deliberately absent from this list. It is populated by
 * `pnpm db:import` from the providers, takes a minute to rebuild, and belongs
 * to nobody -- wiping a thousand imported titles to reset ten demo users was
 * the wrong trade, and it also left fixture rows duplicating real ones.
 * media_rating_stats does go, because it summarises ratings, which go too.
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
      user_media, media_rating_stats,
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

/**
 * Picks titles to build demo activity on top of.
 *
 * Reads the catalogue rather than creating media. Fixture rows were how this
 * worked before the importer existed, and they were actively harmful once it
 * did: three of them failed to match a provider and sat in the catalogue with
 * no artwork, duplicating the real "Dune" and "Shogun" beside them.
 *
 * Only titles with cover art are eligible. A demo built on rows that render as
 * a grey rectangle demonstrates the wrong thing.
 *
 * And only *recognisable* titles, which is the part that was wrong before.
 * This picked at random from the whole catalogue, and at a thousand rows a
 * random sixty is sixty titles nobody has heard of -- so every ranked row in
 * the product ("trending", "what everyone is talking about", "fresh reviews")
 * ended up ranking obscure films, because those were the only ones with any
 * activity attached. The catalogue was fine; the demo activity was pointing at
 * the wrong half of it.
 *
 * Ordered by the provider's vote count, which is the closest thing to "how
 * many people in the world have seen this" that the data has. Books carry no
 * such figure -- Open Library gives none -- so they fall back to import order,
 * and the importer walks Open Library's reading-log ranking, which means the
 * earliest-imported books are the most-read ones.
 *
 * Spread across the media types rather than taken globally, or the whole demo
 * would be films: they have far higher vote counts than anything else.
 */
async function pickCatalogue(db: Database, limit: number): Promise<SeededMedia[]> {
  const perType = Math.ceil(limit / MEDIA_TYPES.length)

  const byType = await Promise.all(
    MEDIA_TYPES.map((mediaType) =>
      db
        .select({
          id: schema.media.id,
          mediaType: schema.media.mediaType,
          metadata: schema.media.metadata,
        })
        .from(schema.media)
        .where(
          sql`${schema.media.coverImageUrl} IS NOT NULL
              AND ${schema.media.mediaType} = ${mediaType}`,
        )
        .orderBy(
          sql`coalesce((${schema.media.metadata} -> 'externalRating' ->> 'votes')::int, 0) DESC`,
          sql`${schema.media.createdAt} ASC`,
        )
        .limit(perType),
    ),
  )

  const rows = byType.flat().slice(0, limit)

  return rows.map((row) => {
    const metadata = (row.metadata ?? {}) as { episodeCount?: number; pageCount?: number }
    return {
      id: row.id,
      mediaType: row.mediaType,
      ...(metadata.episodeCount ? { episodeCount: metadata.episodeCount } : {}),
      ...(metadata.pageCount ? { pageCount: metadata.pageCount } : {}),
    }
  })
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

/**
 * A believable position within a title, or null.
 *
 * Series and books have a countable total; a movie or a game does not, so they
 * get no position rather than a meaningless one. The value stays inside the
 * real total so the UI never has to clamp seeded data.
 */
function progressFor(item: { mediaType: string; episodeCount?: number; pageCount?: number }):
  | number
  | null {
  const total =
    item.mediaType === 'series'
      ? item.episodeCount
      : item.mediaType === 'book'
        ? item.pageCount
        : undefined

  if (!total || total < 2) return null
  // Somewhere in the first 80%, so nothing looks all but finished.
  return 1 + Math.floor(random() * Math.floor(total * 0.8))
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

      const finished = random() > 0.25

      await db.insert(schema.userMedia).values({
        userId: user.id,
        mediaId: item.id,
        status: finished ? 'completed' : 'in_progress',
        startedAt: createdAt,
        completedAt: finished ? createdAt : null,
        // Only things in progress have a position, and only where a position
        // means something. A finished title showing "page 300 of 412" would be
        // a bug, and "episode 37" of an 18-episode series is worse -- seeded
        // data that is visibly wrong teaches people to distrust the screen.
        progress: finished ? null : progressFor(item),
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
