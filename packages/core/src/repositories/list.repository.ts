import { type Executor, schema } from '@revy/db'
import type { ListVisibility } from '@revy/shared/types'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

/** Data access for user lists (SPEC 15). */

type ListRow = typeof schema.lists.$inferSelect
type ListItemRow = typeof schema.listItems.$inferSelect

/**
 * Gap between adjacent positions.
 *
 * Sparse ordering means inserting between two items usually rewrites one row
 * rather than renumbering the whole list. Positions are only compacted when a
 * gap actually runs out.
 */
export const POSITION_GAP = 1000

export const listRepository = {
  async findById(db: Executor, id: string): Promise<ListRow | null> {
    const [row] = await db.select().from(schema.lists).where(eq(schema.lists.id, id)).limit(1)
    return row ?? null
  },

  async create(db: Executor, values: typeof schema.lists.$inferInsert): Promise<ListRow> {
    const [row] = await db.insert(schema.lists).values(values).returning()
    return row!
  },

  async update(
    db: Executor,
    id: string,
    values: Partial<typeof schema.lists.$inferInsert>,
  ): Promise<ListRow | null> {
    const [row] = await db
      .update(schema.lists)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.lists.id, id))
      .returning()
    return row ?? null
  },

  async remove(db: Executor, id: string): Promise<void> {
    await db.delete(schema.lists).where(eq(schema.lists.id, id))
  },

  /** A user's lists, newest activity first. */
  async listForUser(db: Executor, userId: string, visibilities: ListVisibility[]) {
    const scope = eq(schema.lists.userId, userId)

    return db
      .select()
      .from(schema.lists)
      .where(
        visibilities.length > 0
          ? and(scope, inArray(schema.lists.visibility, visibilities))
          : scope,
      )
      .orderBy(desc(schema.lists.updatedAt))
  },

  /**
   * Cover art for the stacked thumbnails on a list card.
   *
   * One query for every list on screen rather than one per list. `DISTINCT ON`
   * is not used because we want several covers per list, so the row number is
   * computed in a window and filtered outside.
   */
  async previewCoversForLists(
    db: Executor,
    listIds: string[],
    perList = 4,
  ): Promise<Map<string, string[]>> {
    if (listIds.length === 0) return new Map()

    const rows = await db
      .select({
        listId: schema.listItems.listId,
        coverImageUrl: schema.media.coverImageUrl,
        rank: sql<number>`row_number() over (
          partition by ${schema.listItems.listId}
          order by ${schema.listItems.position}
        )`.as('rank'),
      })
      .from(schema.listItems)
      .innerJoin(schema.media, eq(schema.media.id, schema.listItems.mediaId))
      .where(inArray(schema.listItems.listId, listIds))

    const covers = new Map<string, string[]>()
    for (const row of rows) {
      if (row.rank > perList || !row.coverImageUrl) continue
      const existing = covers.get(row.listId) ?? []
      existing.push(row.coverImageUrl)
      covers.set(row.listId, existing)
    }
    return covers
  },

  /* ---------------------------------------------------------------- *
   * Items
   * ---------------------------------------------------------------- */

  async listItems(db: Executor, listId: string) {
    return db
      .select({ item: schema.listItems, media: schema.media })
      .from(schema.listItems)
      .innerJoin(schema.media, eq(schema.media.id, schema.listItems.mediaId))
      .where(eq(schema.listItems.listId, listId))
      .orderBy(asc(schema.listItems.position))
  },

  async findItem(db: Executor, listId: string, mediaId: string): Promise<ListItemRow | null> {
    const [row] = await db
      .select()
      .from(schema.listItems)
      .where(and(eq(schema.listItems.listId, listId), eq(schema.listItems.mediaId, mediaId)))
      .limit(1)
    return row ?? null
  },

  /** Highest position currently in the list, or 0 when empty. */
  async maxPosition(db: Executor, listId: string): Promise<number> {
    const [row] = await db
      .select({ max: sql<number>`coalesce(max(${schema.listItems.position}), 0)::int` })
      .from(schema.listItems)
      .where(eq(schema.listItems.listId, listId))
    return row?.max ?? 0
  },

  /**
   * Appends an item. Returns null when the media is already in the list --
   * the unique index decides, so a double-tap cannot create a duplicate.
   */
  async addItem(
    db: Executor,
    values: typeof schema.listItems.$inferInsert,
  ): Promise<ListItemRow | null> {
    const [row] = await db
      .insert(schema.listItems)
      .values(values)
      .onConflictDoNothing()
      .returning()
    return row ?? null
  },

  async removeItem(db: Executor, listId: string, mediaId: string): Promise<boolean> {
    const rows = await db
      .delete(schema.listItems)
      .where(and(eq(schema.listItems.listId, listId), eq(schema.listItems.mediaId, mediaId)))
      .returning({ id: schema.listItems.id })
    return rows.length > 0
  },

  /** Rewrites positions from an explicit order of item ids. */
  async setPositions(db: Executor, listId: string, itemIds: string[]): Promise<void> {
    for (const [index, itemId] of itemIds.entries()) {
      await db
        .update(schema.listItems)
        .set({ position: (index + 1) * POSITION_GAP })
        .where(and(eq(schema.listItems.id, itemId), eq(schema.listItems.listId, listId)))
    }
  },

  /** Recomputes the denormalised item counter from the rows themselves. */
  async syncItemCount(db: Executor, listId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(schema.listItems)
      .where(eq(schema.listItems.listId, listId))

    const total = row?.total ?? 0

    await db
      .update(schema.lists)
      .set({ itemCount: total, updatedAt: new Date() })
      .where(eq(schema.lists.id, listId))

    return total
  },

  /**
   * Which of the viewer's lists already contain each of these media items.
   *
   * Powers the checkmarks in the "Add to list" sheet and `inListIds` on the
   * media page, in one query rather than one per list.
   */
  async listIdsContaining(
    db: Executor,
    userId: string,
    mediaIds: string[],
  ): Promise<Map<string, string[]>> {
    if (mediaIds.length === 0) return new Map()

    const rows = await db
      .select({ mediaId: schema.listItems.mediaId, listId: schema.listItems.listId })
      .from(schema.listItems)
      .innerJoin(schema.lists, eq(schema.lists.id, schema.listItems.listId))
      .where(
        and(eq(schema.lists.userId, userId), inArray(schema.listItems.mediaId, mediaIds)),
      )

    const byMedia = new Map<string, string[]>()
    for (const row of rows) {
      const existing = byMedia.get(row.mediaId) ?? []
      existing.push(row.listId)
      byMedia.set(row.mediaId, existing)
    }
    return byMedia
  },
}
