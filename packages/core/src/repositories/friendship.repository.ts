import { type Executor, schema } from '@revy/db'
import type { FriendshipStatus } from '@revy/shared/types'
import { and, desc, eq, or, sql } from 'drizzle-orm'

/**
 * Data access for the friend graph (SPEC 12).
 *
 * Every lookup here is direction-agnostic: a friendship is one row, and which
 * column holds which user is an implementation detail that must not leak into
 * the services. SPEC 12 requires the relationship work regardless of who
 * initiated it.
 */

type FriendshipRow = typeof schema.friendships.$inferSelect

/** Matches the row for an unordered pair, in either column order. */
function pairPredicate(userA: string, userB: string) {
  return or(
    and(eq(schema.friendships.requesterId, userA), eq(schema.friendships.receiverId, userB)),
    and(eq(schema.friendships.requesterId, userB), eq(schema.friendships.receiverId, userA)),
  )
}

export const friendshipRepository = {
  async findBetween(db: Executor, userA: string, userB: string): Promise<FriendshipRow | null> {
    const [row] = await db
      .select()
      .from(schema.friendships)
      .where(pairPredicate(userA, userB))
      .limit(1)
    return row ?? null
  },

  async findById(db: Executor, id: string): Promise<FriendshipRow | null> {
    const [row] = await db
      .select()
      .from(schema.friendships)
      .where(eq(schema.friendships.id, id))
      .limit(1)
    return row ?? null
  },

  async create(
    db: Executor,
    requesterId: string,
    receiverId: string,
  ): Promise<FriendshipRow | null> {
    // onConflictDoNothing against the LEAST/GREATEST pair index turns a
    // duplicate request -- including the reverse direction -- into a null
    // return instead of a 500. The database is the arbiter, not a prior read.
    const [row] = await db
      .insert(schema.friendships)
      .values({ requesterId, receiverId, status: 'pending' })
      .onConflictDoNothing()
      .returning()
    return row ?? null
  },

  async updateStatus(
    db: Executor,
    id: string,
    status: FriendshipStatus,
  ): Promise<FriendshipRow | null> {
    const [row] = await db
      .update(schema.friendships)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.friendships.id, id))
      .returning()
    return row ?? null
  },

  async remove(db: Executor, id: string): Promise<void> {
    await db.delete(schema.friendships).where(eq(schema.friendships.id, id))
  },

  /**
   * The ids of a user's accepted friends.
   *
   * This is the hot path for the feed, so it selects a single column and
   * normalises direction in SQL rather than fetching rows and mapping in JS.
   */
  async listFriendIds(db: Executor, userId: string): Promise<string[]> {
    const rows = await db
      .select({
        friendId: sql<string>`
          CASE WHEN ${schema.friendships.requesterId} = ${userId}
               THEN ${schema.friendships.receiverId}
               ELSE ${schema.friendships.requesterId}
          END
        `,
      })
      .from(schema.friendships)
      .where(
        and(
          eq(schema.friendships.status, 'accepted'),
          or(
            eq(schema.friendships.requesterId, userId),
            eq(schema.friendships.receiverId, userId),
          ),
        ),
      )

    return rows.map((row) => row.friendId)
  },

  /** Accepted friends with their user rows, for the friends screen. */
  async listFriends(db: Executor, userId: string) {
    const friendId = sql`
      CASE WHEN ${schema.friendships.requesterId} = ${userId}
           THEN ${schema.friendships.receiverId}
           ELSE ${schema.friendships.requesterId}
      END
    `

    return db
      .select({
        friendship: schema.friendships,
        user: schema.users,
      })
      .from(schema.friendships)
      .innerJoin(schema.users, sql`${schema.users.id} = ${friendId}`)
      .where(
        and(
          eq(schema.friendships.status, 'accepted'),
          or(
            eq(schema.friendships.requesterId, userId),
            eq(schema.friendships.receiverId, userId),
          ),
        ),
      )
      .orderBy(schema.users.displayName)
  },

  /** Requests awaiting this user's response (SPEC 12). */
  async listIncomingRequests(db: Executor, userId: string) {
    return db
      .select({
        friendship: schema.friendships,
        user: schema.users,
      })
      .from(schema.friendships)
      .innerJoin(schema.users, eq(schema.users.id, schema.friendships.requesterId))
      .where(
        and(
          eq(schema.friendships.receiverId, userId),
          eq(schema.friendships.status, 'pending'),
        ),
      )
      .orderBy(desc(schema.friendships.createdAt))
  },

  /** Requests this user has sent and can still cancel. */
  async listOutgoingRequests(db: Executor, userId: string) {
    return db
      .select({
        friendship: schema.friendships,
        user: schema.users,
      })
      .from(schema.friendships)
      .innerJoin(schema.users, eq(schema.users.id, schema.friendships.receiverId))
      .where(
        and(
          eq(schema.friendships.requesterId, userId),
          eq(schema.friendships.status, 'pending'),
        ),
      )
      .orderBy(desc(schema.friendships.createdAt))
  },
}
