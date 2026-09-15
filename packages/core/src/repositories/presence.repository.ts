import { type Executor, schema } from '@revy/db'
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm'

/**
 * "Has anybody else been here?" (SPEC 9, 12).
 *
 * Every catalogue can tell you how many people rated something. None of them
 * answer the question somebody actually asks while holding a book they have
 * just bought, which is whether there is anyone to talk to about it. These
 * queries return people, not counts -- the count is a by-product.
 */

/**
 * People who have been through a title, friends first.
 *
 * Friends lead because the question is really about connection, and a name you
 * recognise answers it in a way a stranger's does not. Within each group the
 * most recent first: somebody who finished it last week is far more likely to
 * still want to talk about it than somebody who finished it in 2019.
 *
 * `completed` before `in_progress`, because "I have read it" and "I am reading
 * it" are different answers and the first is the one being asked for -- but
 * the second is still company, so it is not thrown away.
 */
export async function readersOf(
  db: Executor,
  mediaId: string,
  viewerId: string | null,
  friendIds: readonly string[],
  limit: number,
) {
  /*
   * Friendship is decided in SQL only for the ordering, and in JS for the
   * flag.
   *
   * Selecting it as a column looked tidier and does not work: a bare boolean
   * expression comes back unaliased, and the generated `ORDER BY false DESC`
   * is rejected outright. Ordering by a `CASE` and re-deriving the flag from a
   * set the caller already has is both correct and one fewer column on the
   * wire.
   */
  const friends = new Set(friendIds)

  const friendsFirst = friendIds.length
    ? [
        sql`CASE WHEN ${schema.userMedia.userId} IN (${sql.join(
          friendIds.map((id) => sql`${id}`),
          sql`, `,
        )}) THEN 0 ELSE 1 END`,
      ]
    : []

  const conditions = [
    eq(schema.userMedia.mediaId, mediaId),
    inArray(schema.userMedia.status, ['completed', 'in_progress']),
  ]
  // The viewer is not company for themselves.
  if (viewerId) conditions.push(ne(schema.userMedia.userId, viewerId))

  return db
    .select({
      status: schema.userMedia.status,
      completedAt: schema.userMedia.completedAt,
      updatedAt: schema.userMedia.updatedAt,
      userId: schema.users.id,
      username: schema.users.username,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      titleBadgeSlug: schema.users.titleBadgeSlug,
      /*
       * Their score, where they left one.
       *
       * A correlated subquery rather than a join: a join here would be against
       * a table with its own unique index on (user, media), so it can only
       * ever match one row -- and expressing that as a join makes the query
       * read as though it might multiply rows when it cannot.
       */
      score: sql<number | null>`(
        SELECT ${schema.ratings.score} FROM ${schema.ratings}
        WHERE ${schema.ratings.mediaId} = ${mediaId}
          AND ${schema.ratings.userId} = ${schema.userMedia.userId}
      )`,
    })
    .from(schema.userMedia)
    .innerJoin(schema.users, eq(schema.users.id, schema.userMedia.userId))
    .where(and(...conditions))
    .orderBy(
      ...friendsFirst,
      // 'completed' sorts before 'in_progress' as a deliberate ordering, not
      // alphabetically by accident -- spelled out so a future status cannot
      // quietly slot itself into the middle.
      sql`CASE ${schema.userMedia.status} WHEN 'completed' THEN 0 ELSE 1 END`,
      desc(sql`coalesce(${schema.userMedia.completedAt}, ${schema.userMedia.updatedAt})`),
    )
    .limit(limit)
    .then((rows) => rows.map((row) => ({ ...row, isFriend: friends.has(row.userId) })))
}

/** How many people have finished a title, and how many are part-way through. */
export async function presenceCounts(db: Executor, mediaId: string, viewerId: string | null) {
  const notViewer = viewerId ? sql` AND ${schema.userMedia.userId} <> ${viewerId}` : sql``

  const [row] = await db
    .select({
      completedCount: sql<number>`count(*) FILTER (
        WHERE ${schema.userMedia.status} = 'completed'
      )::int`,
      inProgressCount: sql<number>`count(*) FILTER (
        WHERE ${schema.userMedia.status} = 'in_progress'
      )::int`,
    })
    .from(schema.userMedia)
    .where(sql`${schema.userMedia.mediaId} = ${mediaId}${notViewer}`)

  return row ?? { completedCount: 0, inProgressCount: 0 }
}

/**
 * Who else has finished this, for the "you are not the first" moment.
 *
 * Friends first and capped hard: the notification names two people and counts
 * the rest, so fetching more than a handful would be gathering names to throw
 * away.
 */
export async function othersWhoFinished(
  db: Executor,
  mediaId: string,
  viewerId: string,
  friendIds: readonly string[],
  limit: number,
) {
  const friendsFirst = friendIds.length
    ? [
        sql`CASE WHEN ${schema.userMedia.userId} IN (${sql.join(
          friendIds.map((id) => sql`${id}`),
          sql`, `,
        )}) THEN 0 ELSE 1 END`,
      ]
    : []

  return db
    .select({
      displayName: schema.users.displayName,
    })
    .from(schema.userMedia)
    .innerJoin(schema.users, eq(schema.users.id, schema.userMedia.userId))
    .where(
      and(
        eq(schema.userMedia.mediaId, mediaId),
        eq(schema.userMedia.status, 'completed'),
        ne(schema.userMedia.userId, viewerId),
      ),
    )
    .orderBy(...friendsFirst, desc(schema.userMedia.completedAt))
    .limit(limit)
}
