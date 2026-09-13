import type {
  AddListItemInput,
  CreateListInput,
  ReorderListInput,
  UpdateListInput,
} from '@revy/shared/schemas'
import type { ListSummary, ListVisibility, MediaList } from '@revy/shared/types'
import { errors } from '@revy/shared/utils'
import { requireViewer, type ServiceContext } from '../context'
import { toMedia, toUserSummary } from '../mappers'
import {
  activityRepository,
  friendshipRepository,
  listRepository,
  mediaRepository,
  userRepository,
} from '../repositories'
import { POSITION_GAP } from '../repositories/list.repository'
import { badgeService } from './badge.service'
import { xpService } from './xp.service'

/**
 * User lists (SPEC 15).
 *
 * The substance here is visibility. A list is private, friends-only or public,
 * and that single field decides who may read it -- so every read path goes
 * through `assertCanView` rather than each caller remembering to check
 * (SPEC 27).
 */
export const listService = {
  async create(ctx: ServiceContext, input: CreateListInput): Promise<ListSummary> {
    const auth = requireViewer(ctx)

    return auth.db.transaction(async (tx) => {
      const list = await listRepository.create(tx, {
        userId: auth.viewerId,
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility,
      })

      // Only a public list earns XP: it is the one that contributes something
      // other people can find (SPEC 16).
      if (input.visibility === 'public') {
        await xpService.award(tx, auth.viewerId, 'create_public_list')
      }
      await badgeService.evaluate(tx, auth.viewerId, 'list')

      return toSummary(list, [])
    })
  },

  async update(
    ctx: ServiceContext,
    listId: string,
    input: UpdateListInput,
  ): Promise<ListSummary> {
    const auth = requireViewer(ctx)
    const list = await requireOwnedList(ctx, listId)

    const updated = await listRepository.update(auth.db, listId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description ?? null } : {}),
      ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
    })
    if (!updated) throw errors.notFound('LIST_NOT_FOUND', 'List not found.')

    // Going public for the first time is still a contribution worth XP;
    // toggling back and forth is not, so it is awarded only on the transition
    // into `public`.
    if (input.visibility === 'public' && list.visibility !== 'public') {
      await xpService.award(auth.db, auth.viewerId, 'create_public_list')
    }

    const covers = await listRepository.previewCoversForLists(auth.db, [listId])
    return toSummary(updated, covers.get(listId) ?? [])
  },

  async remove(ctx: ServiceContext, listId: string): Promise<void> {
    const auth = requireViewer(ctx)
    const list = await requireOwnedList(ctx, listId)

    await auth.db.transaction(async (tx) => {
      // Items cascade from the list's foreign key.
      await listRepository.remove(tx, listId)
      if (list.visibility === 'public') {
        await xpService.revoke(tx, auth.viewerId, 'create_public_list')
      }
    })
  },

  /**
   * Lists belonging to a user, filtered to what the viewer may see.
   *
   * The filter is applied in the query rather than after it, so a private list
   * never leaves the database for the wrong viewer.
   */
  async listForUser(ctx: ServiceContext, userId: string): Promise<ListSummary[]> {
    const visibilities = await visibleTo(ctx, userId)
    if (visibilities.length === 0) return []

    const rows = await listRepository.listForUser(ctx.db, userId, visibilities)
    const covers = await listRepository.previewCoversForLists(
      ctx.db,
      rows.map((row) => row.id),
    )

    return rows.map((row) => toSummary(row, covers.get(row.id) ?? []))
  },

  /** A list with its items, if the viewer is allowed to see it. */
  async get(ctx: ServiceContext, listId: string): Promise<MediaList> {
    const list = await listRepository.findById(ctx.db, listId)
    if (!list) throw errors.notFound('LIST_NOT_FOUND', 'List not found.')

    await assertCanView(ctx, list)

    const [owner, rows, covers] = await Promise.all([
      userRepository.findById(ctx.db, list.userId),
      listRepository.listItems(ctx.db, listId),
      listRepository.previewCoversForLists(ctx.db, [listId]),
    ])
    if (!owner) throw errors.userNotFound()

    return {
      ...toSummary(list, covers.get(listId) ?? []),
      user: toUserSummary(owner),
      items: rows.map((row) => ({
        id: row.item.id,
        media: toMedia(row.media),
        position: row.item.position,
        note: row.item.note,
        addedAt: row.item.createdAt.toISOString(),
      })),
    }
  },

  /** Adds media to a list. Appending is the only insert position. */
  async addItem(
    ctx: ServiceContext,
    listId: string,
    input: AddListItemInput,
  ): Promise<{ added: boolean; itemCount: number }> {
    const auth = requireViewer(ctx)
    const list = await requireOwnedList(ctx, listId)

    const media = await mediaRepository.findById(auth.db, input.mediaId)
    if (!media) throw errors.mediaNotFound()

    return auth.db.transaction(async (tx) => {
      const maxPosition = await listRepository.maxPosition(tx, listId)

      const item = await listRepository.addItem(tx, {
        listId,
        mediaId: input.mediaId,
        position: maxPosition + POSITION_GAP,
        note: input.note ?? null,
      })

      // Already present. Not an error -- the list is in the state the caller
      // wanted -- but nothing new happened, so no activity and no recount.
      if (!item) {
        return { added: false, itemCount: list.itemCount }
      }

      const itemCount = await listRepository.syncItemCount(tx, listId)

      // Only public lists produce feed activity. A private "To Watch" list is
      // a planning tool, and broadcasting every addition would flood friends.
      if (list.visibility === 'public') {
        await activityRepository.create(tx, {
          userId: auth.viewerId,
          type: 'added_to_list',
          mediaId: input.mediaId,
          listId,
        })
      }

      return { added: true, itemCount }
    })
  },

  async removeItem(
    ctx: ServiceContext,
    listId: string,
    mediaId: string,
  ): Promise<{ removed: boolean; itemCount: number }> {
    const auth = requireViewer(ctx)
    await requireOwnedList(ctx, listId)

    return auth.db.transaction(async (tx) => {
      const removed = await listRepository.removeItem(tx, listId, mediaId)
      const itemCount = await listRepository.syncItemCount(tx, listId)

      if (removed) {
        await activityRepository.removeForMedia(tx, auth.viewerId, mediaId, 'added_to_list')
      }

      return { removed, itemCount }
    })
  },

  /**
   * Reorders a list from an explicit sequence of item ids.
   *
   * The client sends the full order rather than a moved-from/moved-to pair:
   * it is idempotent, it cannot drift from what the user sees, and a dropped
   * request just means the next one fixes it.
   */
  async reorder(ctx: ServiceContext, listId: string, input: ReorderListInput): Promise<void> {
    const auth = requireViewer(ctx)
    await requireOwnedList(ctx, listId)

    const existing = await listRepository.listItems(auth.db, listId)
    const known = new Set(existing.map((row) => row.item.id))

    // Every id must belong to this list, and all of them must be present --
    // otherwise a partial order would silently leave items stacked at stale
    // positions.
    if (input.itemIds.length !== known.size) {
      throw errors.validation(
        { itemIds: ['The order must include every item in the list.'] },
        'That order does not match the list.',
      )
    }
    for (const id of input.itemIds) {
      if (!known.has(id)) {
        throw errors.validation(
          { itemIds: ['That item is not in this list.'] },
          'That order does not match the list.',
        )
      }
    }

    await auth.db.transaction(async (tx) => {
      await listRepository.setPositions(tx, listId, input.itemIds)
      await listRepository.update(tx, listId, {})
    })
  },

  /** Which of the viewer's lists contain a given media item. */
  async listIdsContaining(ctx: ServiceContext, mediaId: string): Promise<string[]> {
    if (!ctx.viewerId) return []
    const byMedia = await listRepository.listIdsContaining(ctx.db, ctx.viewerId, [mediaId])
    return byMedia.get(mediaId) ?? []
  },
}

/* ------------------------------------------------------------------ *
 * Visibility (SPEC 15, 27)
 * ------------------------------------------------------------------ */

/**
 * Which visibilities the viewer may see of `ownerId`'s lists.
 *
 * Returned as a filter rather than a boolean so callers can push it into the
 * query. Own lists: everything. A friend's: public and friends. A stranger's:
 * public only.
 */
async function visibleTo(ctx: ServiceContext, ownerId: string): Promise<ListVisibility[]> {
  if (ctx.viewerId === ownerId) return ['private', 'friends', 'public']

  if (ctx.viewerId) {
    const friendIds = await friendshipRepository.listFriendIds(ctx.db, ctx.viewerId)
    if (friendIds.includes(ownerId)) return ['friends', 'public']
  }

  return ['public']
}

/** Throws unless the viewer may read this list. */
async function assertCanView(
  ctx: ServiceContext,
  list: { userId: string; visibility: ListVisibility },
): Promise<void> {
  const allowed = await visibleTo(ctx, list.userId)
  if (allowed.includes(list.visibility)) return

  // Reported as not-found rather than forbidden: confirming a private list
  // exists is itself a small leak (OWASP A01).
  throw errors.notFound('LIST_NOT_FOUND', 'List not found.')
}

/** Loads a list the viewer owns, or throws. Every mutation starts here. */
async function requireOwnedList(ctx: ServiceContext, listId: string) {
  const auth = requireViewer(ctx)

  const list = await listRepository.findById(auth.db, listId)
  if (!list) throw errors.notFound('LIST_NOT_FOUND', 'List not found.')
  if (list.userId !== auth.viewerId) {
    throw errors.notFound('LIST_NOT_FOUND', 'List not found.')
  }

  return list
}

function toSummary(
  row: {
    id: string
    name: string
    description: string | null
    visibility: ListVisibility
    itemCount: number
    createdAt: Date
    updatedAt: Date
  },
  previewCovers: string[],
): ListSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    itemCount: row.itemCount,
    previewCovers,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
