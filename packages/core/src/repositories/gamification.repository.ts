import { type Executor, schema } from '@revy/db'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'

/** Data access for badges (SPEC 17). */

type BadgeRow = typeof schema.badges.$inferSelect

export const gamificationRepository = {
  async listBadges(db: Executor): Promise<BadgeRow[]> {
    return db.select().from(schema.badges)
  },

  async findBadgeBySlug(db: Executor, slug: string): Promise<BadgeRow | null> {
    const [row] = await db.select().from(schema.badges).where(eq(schema.badges.slug, slug)).limit(1)
    return row ?? null
  },

  /** Badges of a given requirement type, so evaluation only loads what it needs. */
  async listBadgesByRequirement(db: Executor, requirementTypes: string[]): Promise<BadgeRow[]> {
    if (requirementTypes.length === 0) return []
    return db
      .select()
      .from(schema.badges)
      .where(inArray(schema.badges.requirementType, requirementTypes))
  },

  async listEarned(db: Executor, userId: string) {
    return db
      .select({ badge: schema.badges, earnedAt: schema.userBadges.earnedAt })
      .from(schema.userBadges)
      .innerJoin(schema.badges, eq(schema.badges.id, schema.userBadges.badgeId))
      .where(eq(schema.userBadges.userId, userId))
      .orderBy(desc(schema.userBadges.earnedAt))
  },

  /**
   * Points a user's displayed title at a badge, if it outranks the current one.
   *
   * The comparison happens in SQL rather than by reading the row first: two
   * badges can be earned in the same evaluation pass, and a read-then-write
   * would let the second overwrite the first's promotion with a lower tier.
   *
   * A null title always loses, so the first badge anybody earns becomes their
   * title. A tie keeps the incumbent -- see `badgeService`.
   */
  async promoteTitleIfRarer(
    db: Executor,
    userId: string,
    slug: string,
    tier: number,
  ): Promise<void> {
    await db
      .update(schema.users)
      .set({ titleBadgeSlug: slug })
      .where(
        and(
          eq(schema.users.id, userId),
          sql`(
            ${schema.users.titleBadgeSlug} IS NULL
            OR ${tier} > COALESCE(
              (SELECT b.tier FROM ${schema.badges} b
               WHERE b.slug = ${schema.users.titleBadgeSlug}),
              0)
          )`,
        ),
      )
  },

  async listEarnedBadgeIds(db: Executor, userId: string): Promise<Set<string>> {
    const rows = await db
      .select({ badgeId: schema.userBadges.badgeId })
      .from(schema.userBadges)
      .where(eq(schema.userBadges.userId, userId))
    return new Set(rows.map((row) => row.badgeId))
  },

  /**
   * Awards a badge. Returns false when it was already held.
   *
   * ON CONFLICT DO NOTHING against the (user, badge) unique index means a
   * re-evaluation can run as often as it likes without ever double-awarding or
   * sending a duplicate notification.
   */
  async award(db: Executor, userId: string, badgeId: string): Promise<boolean> {
    const rows = await db
      .insert(schema.userBadges)
      .values({ userId, badgeId })
      .onConflictDoNothing()
      .returning({ badgeId: schema.userBadges.badgeId })
    return rows.length > 0
  },

  /**
   * Counts backing each badge requirement type, in one query.
   *
   * Badge evaluation runs after every rating, review and comment, so it must
   * not cost six round trips. `requirementMediaType` badges are counted from
   * the per-type breakdown the caller already has.
   */
  async getRequirementCounts(db: Executor, userId: string) {
    const [row] = await db
      .select({
        rating_count: sql<number>`(
          SELECT count(*)::int FROM ${schema.ratings}
          WHERE ${schema.ratings.userId} = ${userId}
        )`,
        review_count: sql<number>`(
          SELECT count(*)::int FROM ${schema.reviews}
          WHERE ${schema.reviews.userId} = ${userId}
        )`,
        discussion_count: sql<number>`(
          SELECT count(*)::int FROM ${schema.discussionThreads}
          WHERE ${schema.discussionThreads.userId} = ${userId}
        )`,
        comment_count: sql<number>`(
          SELECT count(*)::int FROM ${schema.discussionComments}
          WHERE ${schema.discussionComments.userId} = ${userId}
        )`,
        friend_count: sql<number>`(
          SELECT count(*)::int FROM ${schema.friendships}
          WHERE ${schema.friendships.status} = 'accepted'
            AND (${schema.friendships.requesterId} = ${userId}
                 OR ${schema.friendships.receiverId} = ${userId})
        )`,
        list_count: sql<number>`(
          SELECT count(*)::int FROM ${schema.lists}
          WHERE ${schema.lists.userId} = ${userId}
        )`,
      })
      .from(sql`(SELECT 1) AS placeholder`)

    return (
      row ?? {
        rating_count: 0,
        review_count: 0,
        discussion_count: 0,
        comment_count: 0,
        friend_count: 0,
        list_count: 0,
      }
    )
  },

  /** Ratings per media type, for the 'First Movie / Series / Book' badges. */
  async getRatingCountsByType(db: Executor, userId: string) {
    return db
      .select({
        mediaType: schema.media.mediaType,
        total: sql<number>`count(*)::int`,
      })
      .from(schema.ratings)
      .innerJoin(schema.media, eq(schema.media.id, schema.ratings.mediaId))
      .where(eq(schema.ratings.userId, userId))
      .groupBy(schema.media.mediaType)
  },

  /** Upserts the badge catalogue from the shared definitions (seed + migrate). */
  async upsertBadge(
    db: Executor,
    values: typeof schema.badges.$inferInsert,
  ): Promise<BadgeRow> {
    const [row] = await db
      .insert(schema.badges)
      .values(values)
      .onConflictDoUpdate({
        target: schema.badges.slug,
        set: {
          name: values.name,
          description: values.description,
          icon: values.icon,
          tier: values.tier,
          requirementType: values.requirementType,
          requirementValue: values.requirementValue,
          requirementMediaType: values.requirementMediaType ?? null,
        },
      })
      .returning()
    return row!
  },
}

/** Narrow helper so services can query one badge/user pair cheaply. */
export async function hasBadge(
  db: Executor,
  userId: string,
  badgeId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ badgeId: schema.userBadges.badgeId })
    .from(schema.userBadges)
    .where(and(eq(schema.userBadges.userId, userId), eq(schema.userBadges.badgeId, badgeId)))
    .limit(1)
  return row !== undefined
}
