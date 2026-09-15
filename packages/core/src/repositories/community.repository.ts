import { type Executor, schema } from '@revy/db'
import { and, asc, desc, eq, exists, ilike, inArray, isNotNull, or, sql } from 'drizzle-orm'

/** Data access for community membership (SPEC 14). */

/*
 * Membership and discussion rolled up per media item.
 *
 * Grouped subqueries rather than correlated ones, because both directory
 * listings *sort* by these values: a correlated `count(*)` would be evaluated
 * for every row in the catalogue before the sort could start, where this scans
 * the two small tables once. `community_members` and `discussion_threads` hold
 * a row only where somebody has actually done something, so they stay small
 * while `media` grows with every title anyone searches for.
 */
function memberAggregate(db: Executor) {
  return db
    .select({
      mediaId: schema.communityMembers.mediaId,
      total: sql<number>`count(*)::int`.as('total'),
      lastJoinedAt: sql<Date | null>`max(${schema.communityMembers.joinedAt})`.as(
        'last_joined_at',
      ),
    })
    .from(schema.communityMembers)
    .groupBy(schema.communityMembers.mediaId)
    .as('member_agg')
}

function threadAggregate(db: Executor) {
  return db
    .select({
      mediaId: schema.discussionThreads.mediaId,
      threadCount: sql<number>`count(*)::int`.as('thread_count'),
      replyCount: sql<number>`coalesce(sum(${schema.discussionThreads.replyCount}), 0)::int`.as(
        'reply_count',
      ),
      lastActivityAt: sql<Date | null>`max(${schema.discussionThreads.lastActivityAt})`.as(
        'last_activity_at',
      ),
    })
    .from(schema.discussionThreads)
    .groupBy(schema.discussionThreads.mediaId)
    .as('thread_agg')
}

/**
 * Matches a typed query against every name a title is known by.
 *
 * Three places, because one is not enough:
 *
 *  - `title`, the provider's default, which is English in practice.
 *  - `original_title`, so "Idiot" finds "Идиот" and vice versa.
 *  - `media_translations.title`, **any** language -- this is the one that
 *    matters. A Brazilian reader looking for "Batman: O Cavaleiro das Trevas"
 *    is not going to guess "The Dark Knight", and that release title is a name
 *    the film actually has rather than a translation anyone could derive.
 *
 * Any language rather than the reader's own, because somebody browsing in
 * Portuguese may well type the English name they saw elsewhere. Matching more
 * broadly costs nothing here and refusing to would be a dead end with no
 * explanation on screen.
 *
 * `ilike` with leading and trailing wildcards cannot use a btree index, so
 * this is a scan of `media`. Fine at the catalogue's current size and the
 * honest fix later is a trigram index (`pg_trgm`), which the schema's
 * `media_title_idx` comment already anticipates -- not a hand-rolled prefix
 * search that would stop finding "Dark Knight" in "The Dark Knight".
 */
function matchesTitle(db: Executor, query: string) {
  const pattern = `%${query}%`

  return or(
    ilike(schema.media.title, pattern),
    ilike(schema.media.originalTitle, pattern),
    exists(
      db
        .select({ one: sql`1` })
        .from(schema.mediaTranslations)
        .where(
          and(
            eq(schema.mediaTranslations.mediaId, schema.media.id),
            ilike(schema.mediaTranslations.title, pattern),
          ),
        ),
    ),
  )
}

export const communityRepository = {
  /** Joining twice is a no-op; the unique index decides, not a prior read. */
  async join(db: Executor, mediaId: string, userId: string): Promise<boolean> {
    const rows = await db
      .insert(schema.communityMembers)
      .values({ mediaId, userId })
      .onConflictDoNothing()
      .returning({ mediaId: schema.communityMembers.mediaId })
    return rows.length > 0
  },

  async leave(db: Executor, mediaId: string, userId: string): Promise<boolean> {
    const rows = await db
      .delete(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.mediaId, mediaId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .returning({ mediaId: schema.communityMembers.mediaId })
    return rows.length > 0
  },

  async isMember(db: Executor, mediaId: string, userId: string): Promise<boolean> {
    const [row] = await db
      .select({ mediaId: schema.communityMembers.mediaId })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.mediaId, mediaId),
          eq(schema.communityMembers.userId, userId),
        ),
      )
      .limit(1)
    return row !== undefined
  },

  /**
   * Member counts for several communities at once.
   *
   * Counted rather than denormalised, unlike rating aggregates. A community
   * page is not on the hot path the way a media page is, the index covers it,
   * and one fewer denormalised counter is one fewer thing that can drift. If
   * this ever shows up in a slow query log, the fix is the same shape as
   * media_rating_stats.
   */
  async memberCounts(db: Executor, mediaIds: string[]): Promise<Map<string, number>> {
    if (mediaIds.length === 0) return new Map()

    const rows = await db
      .select({
        mediaId: schema.communityMembers.mediaId,
        total: sql<number>`count(*)::int`,
      })
      .from(schema.communityMembers)
      .where(inArray(schema.communityMembers.mediaId, mediaIds))
      .groupBy(schema.communityMembers.mediaId)

    return new Map(rows.map((row) => [row.mediaId, row.total]))
  },

  /** Which of these communities the viewer belongs to. */
  async membershipsFor(
    db: Executor,
    userId: string,
    mediaIds: string[],
  ): Promise<Set<string>> {
    if (mediaIds.length === 0) return new Set()

    const rows = await db
      .select({ mediaId: schema.communityMembers.mediaId })
      .from(schema.communityMembers)
      .where(
        and(
          eq(schema.communityMembers.userId, userId),
          inArray(schema.communityMembers.mediaId, mediaIds),
        ),
      )
    return new Set(rows.map((row) => row.mediaId))
  },

  async listMembers(db: Executor, mediaId: string, limit: number) {
    return db
      .select({ user: schema.users, joinedAt: schema.communityMembers.joinedAt })
      .from(schema.communityMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.communityMembers.userId))
      .where(eq(schema.communityMembers.mediaId, mediaId))
      .orderBy(desc(schema.communityMembers.joinedAt))
      .limit(limit)
  },

  /** The communities a user has joined, most recent first. */
  async listJoined(db: Executor, userId: string, limit: number, query?: string) {
    return db
      .select({ media: schema.media, joinedAt: schema.communityMembers.joinedAt })
      .from(schema.communityMembers)
      .innerJoin(schema.media, eq(schema.media.id, schema.communityMembers.mediaId))
      .where(
        and(
          eq(schema.communityMembers.userId, userId),
          query ? matchesTitle(db, query) : undefined,
        ),
      )
      .orderBy(desc(schema.communityMembers.joinedAt))
      .limit(limit)
  },

  /**
   * Communities the viewer's friends are in (SPEC 12, 14).
   *
   * The strongest join signal available: a friend being somewhere beats every
   * ranking a query can compute, because the reason to be in a community is
   * usually the people in it rather than the title on the door.
   *
   * Ranked by how many friends are there, then by the most recent of their
   * joins -- so three friends beats one, and a fresh join beats an old one at
   * the same count. Communities the viewer has already joined stay in the
   * list: leaving them out would make the tab flicker items away as you join
   * them, and "who else is here" is still what you came to see.
   */
  async listFriends(db: Executor, friendIds: string[], limit: number, query?: string) {
    if (friendIds.length === 0) return []

    const members = memberAggregate(db)
    const threads = threadAggregate(db)

    const friendJoins = db
      .select({
        mediaId: schema.communityMembers.mediaId,
        friendCount: sql<number>`count(*)::int`.as('friend_count'),
        lastFriendJoinAt: sql<Date>`max(${schema.communityMembers.joinedAt})`.as(
          'last_friend_join_at',
        ),
      })
      .from(schema.communityMembers)
      .where(inArray(schema.communityMembers.userId, friendIds))
      .groupBy(schema.communityMembers.mediaId)
      .as('friend_joins')

    return db
      .select({
        media: schema.media,
        memberCount: sql<number>`coalesce(${members.total}, 0)::int`,
        threadCount: sql<number>`coalesce(${threads.threadCount}, 0)::int`,
        replyCount: sql<number>`coalesce(${threads.replyCount}, 0)::int`,
        lastActivityAt: threads.lastActivityAt,
        friendCount: friendJoins.friendCount,
      })
      .from(friendJoins)
      .innerJoin(schema.media, eq(schema.media.id, friendJoins.mediaId))
      .leftJoin(members, eq(members.mediaId, schema.media.id))
      .leftJoin(threads, eq(threads.mediaId, schema.media.id))
      .where(query ? matchesTitle(db, query) : undefined)
      .orderBy(desc(friendJoins.friendCount), desc(friendJoins.lastFriendJoinAt))
      .limit(limit)
  },

  /**
   * Which friends are in each of these communities, for the faces on the card.
   *
   * A count alone would render as "3 friends", which says less than three
   * avatars and a name -- the point of the tab is *who*, not how many. Capped
   * per community in the mapper rather than here, because the cap is a layout
   * decision and this is the data.
   */
  async friendMembersFor(db: Executor, friendIds: string[], mediaIds: string[]) {
    if (friendIds.length === 0 || mediaIds.length === 0) return []

    return db
      .select({ mediaId: schema.communityMembers.mediaId, user: schema.users })
      .from(schema.communityMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.communityMembers.userId))
      .where(
        and(
          inArray(schema.communityMembers.mediaId, mediaIds),
          inArray(schema.communityMembers.userId, friendIds),
        ),
      )
      .orderBy(desc(schema.communityMembers.joinedAt))
  },

  /**
   * Communities worth showing, ranked by how alive they are.
   *
   * "Alive" counts joining, not only talking. This started from
   * `discussion_threads` and inner-joined media, which meant a community with
   * members and no thread yet appeared **nowhere** -- its own members could
   * reach it from the Joined tab and nobody else could find it at all. That is
   * a deadlock, not a ranking: the first thread never gets written because the
   * place to write it is undiscoverable.
   *
   * So both signals count, and the rank is whichever happened more recently.
   * Expressed as two LEFT JOINs from `media` with an OR filter rather than a
   * FULL OUTER JOIN of the two aggregates -- same rows, but the media row
   * comes along without joining back through a `coalesce` of two ids.
   */
  async listActive(db: Executor, limit: number, query?: string) {
    const members = memberAggregate(db)
    const threads = threadAggregate(db)

    return db
      .select({
        media: schema.media,
        memberCount: sql<number>`coalesce(${members.total}, 0)::int`,
        threadCount: sql<number>`coalesce(${threads.threadCount}, 0)::int`,
        replyCount: sql<number>`coalesce(${threads.replyCount}, 0)::int`,
        /*
         * Thread activity only, deliberately -- the card renders this as
         * "Active 3 days ago", and a join is not something anyone said. The
         * *ranking* below uses both; a member-only community therefore sorts
         * high with no timestamp shown, which reads correctly because the card
         * falls back to its member count.
         */
        lastActivityAt: threads.lastActivityAt,
      })
      .from(schema.media)
      .leftJoin(members, eq(members.mediaId, schema.media.id))
      .leftJoin(threads, eq(threads.mediaId, schema.media.id))
      // One signal or the other. Without this the LEFT JOINs would return the
      // entire catalogue, which is what the Browse tab is for.
      .where(
        and(
          or(isNotNull(threads.mediaId), isNotNull(members.mediaId)),
          query ? matchesTitle(db, query) : undefined,
        ),
      )
      /*
       * `greatest` ignores NULLs in Postgres rather than poisoning the result,
       * so no coalesce is needed, and the filter above guarantees at least one
       * side is present -- meaning this can never be NULL and the default
       * NULLS FIRST of a DESC sort never comes into play.
       */
      .orderBy(sql`greatest(${threads.lastActivityAt}, ${members.lastJoinedAt}) desc`)
      .limit(limit)
  },

  /**
   * The whole catalogue as a directory, most-joined first.
   *
   * The counterpart to `listActive`, and the answer to "are communities
   * created up front". They are not records, so there is nothing to create --
   * but a reader still needs to be able to see one before there is anything in
   * it, which is what this lists. Every title is here from the moment it
   * enters the catalogue.
   *
   * Ranked by members, then by how many people rated it. The second key is
   * what stops a cold start from being alphabetical noise: nobody has joined
   * anything yet, so interest is the only signal available, and it is a real
   * one.
   *
   * Offset paging rather than a keyset cursor. The sort keys are counts that
   * change under the reader -- somebody joining shifts a title between page
   * fetches -- so a cursor would buy exact-once delivery this does not have
   * anyway. A browse directory can tolerate an item appearing twice; the cost
   * of offset paging is a deep-page scan, and the fix if it ever matters is a
   * denormalised member counter, the same shape as media_rating_stats.
   */
  async listBrowse(db: Executor, limit: number, offset: number, query?: string) {
    const members = memberAggregate(db)
    const threads = threadAggregate(db)

    return db
      .select({
        media: schema.media,
        memberCount: sql<number>`coalesce(${members.total}, 0)::int`,
        threadCount: sql<number>`coalesce(${threads.threadCount}, 0)::int`,
        replyCount: sql<number>`coalesce(${threads.replyCount}, 0)::int`,
        lastActivityAt: threads.lastActivityAt,
      })
      .from(schema.media)
      .leftJoin(members, eq(members.mediaId, schema.media.id))
      .leftJoin(threads, eq(threads.mediaId, schema.media.id))
      .leftJoin(schema.mediaRatingStats, eq(schema.mediaRatingStats.mediaId, schema.media.id))
      .where(query ? matchesTitle(db, query) : undefined)
      .orderBy(
        sql`coalesce(${members.total}, 0) desc`,
        sql`coalesce(${schema.mediaRatingStats.ratingCount}, 0) desc`,
        // A total order, so paging cannot skip or repeat a row merely because
        // two titles tie on both counts -- which, at zero and zero, most do.
        asc(schema.media.id),
      )
      .limit(limit)
      .offset(offset)
  },
}
