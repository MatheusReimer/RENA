import { PAGE_SIZE_DEFAULT } from '@revy/shared/constants'
import type { NotificationQueryInput } from '@revy/shared/schemas'
import type { Notification, Paginated } from '@revy/shared/types'
import { requireViewer, type ServiceContext } from '../context'
import { toUserSummary } from '../mappers'
import { notificationRepository } from '../repositories'

/** Notifications (SPEC 23). */
export const notificationService = {
  async list(
    ctx: ServiceContext,
    input: NotificationQueryInput,
  ): Promise<Paginated<Notification>> {
    const auth = requireViewer(ctx)
    const limit = input.limit ?? PAGE_SIZE_DEFAULT

    const cursor = input.cursor ? new Date(input.cursor) : null
    const rows = await notificationRepository.list(
      auth.db,
      auth.viewerId,
      input.filter,
      limit + 1,
      cursor && !Number.isNaN(cursor.getTime()) ? cursor : null,
    )

    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows

    const items: Notification[] = page.map((row) => ({
      id: row.notification.id,
      type: row.notification.type,
      actor: row.actor ? toUserSummary(row.actor) : null,
      entityId: row.notification.entityId,
      context: row.notification.context ?? {},
      readAt: row.notification.readAt?.toISOString() ?? null,
      createdAt: row.notification.createdAt.toISOString(),
    }))

    return {
      items,
      nextCursor: hasMore ? (items[items.length - 1]?.createdAt ?? null) : null,
    }
  },

  async countUnread(ctx: ServiceContext): Promise<number> {
    if (!ctx.viewerId) return 0
    return notificationRepository.countUnread(ctx.db, ctx.viewerId)
  },

  /** Marks the given notifications read, or all of them when ids is omitted. */
  async markRead(ctx: ServiceContext, ids?: string[]): Promise<void> {
    const auth = requireViewer(ctx)
    await notificationRepository.markRead(auth.db, auth.viewerId, ids)
  },
}
