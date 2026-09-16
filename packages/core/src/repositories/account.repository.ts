import { type Executor, schema } from '@revy/db'
import { and, eq, inArray, notInArray, or, sql } from 'drizzle-orm'

/**
 * Data access for deleting an account.
 *
 * The write is a sequence rather than a single delete, because the row itself
 * stays: what somebody wrote in public survives them, under an anonymous name,
 * so the discussions other people joined remain readable. Everything that is
 * *about* the person rather than *by* them goes.
 */
export const accountRepository = {
  /**
   * Erases the private half of an account.
   *
   * What goes: the library and its progress, lists, taste answers, badges and
   * XP, community memberships, friendships in either direction, notifications,
   * feed entries, blocks, direct messages, and the credential record with
   * every session on it.
   *
   * What stays: reviews, discussion threads and comments, and the ratings
   * underneath the public averages -- removing those would silently restate
   * every score this person ever gave. They are no longer attributable to
   * anybody once the profile is anonymised.
   */
  async erasePrivateData(db: Executor, userId: string): Promise<void> {
    // Their side of every conversation. The other person keeps their own
    // messages: this is one account leaving, not a thread being retracted.
    await db.delete(schema.messages).where(eq(schema.messages.senderId, userId))
    await db
      .delete(schema.conversationParticipants)
      .where(eq(schema.conversationParticipants.userId, userId))

    /*
     * Conversations nobody is left in.
     *
     * Not cascaded, because a conversation row has no user on it -- the
     * participants do. Left behind they would be rows nobody can ever reach.
     */
    const orphaned = db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .leftJoin(
        schema.conversationParticipants,
        eq(schema.conversationParticipants.conversationId, schema.conversations.id),
      )
      .groupBy(schema.conversations.id)
      .having(sql`count(${schema.conversationParticipants.userId}) = 0`)

    const empty = await orphaned
    if (empty.length > 0) {
      await db.delete(schema.conversations).where(
        inArray(
          schema.conversations.id,
          empty.map((row) => row.id),
        ),
      )
    }

    await db
      .delete(schema.friendships)
      .where(
        or(
          eq(schema.friendships.requesterId, userId),
          eq(schema.friendships.receiverId, userId),
        ),
      )

    await db
      .delete(schema.userBlocks)
      .where(
        or(eq(schema.userBlocks.blockerId, userId), eq(schema.userBlocks.blockedId, userId)),
      )

    await db
      .delete(schema.notifications)
      .where(
        or(eq(schema.notifications.userId, userId), eq(schema.notifications.actorId, userId)),
      )

    await db.delete(schema.activities).where(eq(schema.activities.userId, userId))
    await db.delete(schema.activityLikes).where(eq(schema.activityLikes.userId, userId))
    await db.delete(schema.listItems).where(
      inArray(
        schema.listItems.listId,
        db.select({ id: schema.lists.id }).from(schema.lists).where(eq(schema.lists.userId, userId)),
      ),
    )
    await db.delete(schema.lists).where(eq(schema.lists.userId, userId))
    await db.delete(schema.userMedia).where(eq(schema.userMedia.userId, userId))
    await db.delete(schema.userTaste).where(eq(schema.userTaste.userId, userId))
    await db.delete(schema.userBadges).where(eq(schema.userBadges.userId, userId))
    await db.delete(schema.userXp).where(eq(schema.userXp.userId, userId))
    await db.delete(schema.communityMembers).where(eq(schema.communityMembers.userId, userId))
    await db.delete(schema.messageHides).where(eq(schema.messageHides.userId, userId))
  },

  /**
   * Replaces the profile with an anonymous one and marks it deleted.
   *
   * The username has to stay unique -- it is a unique index and the old one
   * should be free for somebody else -- so it becomes the prefix plus a random
   * suffix rather than a fixed string.
   */
  async anonymise(
    db: Executor,
    userId: string,
    values: { username: string; displayName: string },
  ): Promise<void> {
    await db
      .update(schema.users)
      .set({
        username: values.username,
        displayName: values.displayName,
        avatarUrl: null,
        bio: null,
        titleBadgeSlug: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, userId))
  },

  /**
   * Removes the credential record, which takes the address and every session
   * with it. `users.auth_user_id` is nulled by the foreign key rather than
   * cascading, which is what leaves the anonymised row standing.
   */
  async deleteAuthUser(db: Executor, authUserId: string): Promise<void> {
    await db.delete(schema.authUser).where(eq(schema.authUser.id, authUserId))
  },

  /** True when this username is free, used to settle the anonymous suffix. */
  async usernameTaken(db: Executor, username: string): Promise<boolean> {
    const [row] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`lower(${schema.users.username}) = lower(${username})`)
      .limit(1)
    return row !== undefined
  },

  /** Ids of accounts that no longer exist, for queries that must exclude them. */
  async deletedIds(db: Executor, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(inArray(schema.users.id, ids), sql`${schema.users.deletedAt} is not null`))
    return rows.map((row) => row.id)
  },

  /** Every live account among the given ids. */
  async liveIds(db: Executor, ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const rows = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(and(inArray(schema.users.id, ids), sql`${schema.users.deletedAt} is null`))
    return rows.map((row) => row.id)
  },

  /** Guard for lookups that must never return a deleted account. */
  live(ids: string[]) {
    return notInArray(schema.users.id, ids)
  },
}
