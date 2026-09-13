import { type Executor, schema } from '@revy/db'
import type { NotificationType } from '@revy/shared/types'
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'

/** Data access for notifications (SPEC 23). */

type NotificationRow = typeof schema.notifications.$inferSelect

/** Groups notification types for the filter chips on the notifications screen. */
const FILTER_TYPES: Record<string, NotificationType[]> = {
  friends: ['friend_request', 'friend_request_accepted'],
  discussions: ['reply_to_discussion', 'comment_on_review', 'mentioned'],
  system: ['badge_earned'],
}

export const notificationRepository = {
  async create(
    db: Executor,
    values: typeof schema.notifications.$inferInsert,
  ): Promise<NotificationRow> {
    const [row] = await db.insert(schema.notifications).values(values).returning()
    return row!
  },

  async list(
    db: Executor,
    userId: string,
    filter: string,
    limit: number,
    cursor: Date | null,
  ) {
    const types = FILTER_TYPES[filter]
    const conditions = [eq(schema.notifications.userId, userId)]
    if (types) conditions.push(inArray(schema.notifications.type, types))
    if (cursor) conditions.push(lt(schema.notifications.createdAt, cursor))

    return db
      .select({
        notification: schema.notifications,
        actor: schema.users,
      })
      .from(schema.notifications)
      .leftJoin(schema.users, eq(schema.users.id, schema.notifications.actorId))
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
  },

  async countUnread(db: Executor, userId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.notifications)
      .where(
        and(eq(schema.notifications.userId, userId), isNull(schema.notifications.readAt)),
      )
    return row?.total ?? 0
  },

  /** Marks the given ids read, or everything unread when `ids` is undefined. */
  async markRead(db: Executor, userId: string, ids?: string[]): Promise<void> {
    const conditions = [
      eq(schema.notifications.userId, userId),
      isNull(schema.notifications.readAt),
    ]
    if (ids && ids.length > 0) conditions.push(inArray(schema.notifications.id, ids))

    await db
      .update(schema.notifications)
      .set({ readAt: new Date() })
      .where(and(...conditions))
  },
}
