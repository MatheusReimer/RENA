import { schema } from '@revy/db'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { isNull, notInArray, type SQL } from 'drizzle-orm'

/**
 * The two conditions almost every query listing people has to carry.
 *
 * Both return `undefined` when they have nothing to add, which is what lets
 * call sites pass them straight into `and(...)` -- Drizzle drops undefined
 * conditions, so the common case (nobody blocked) costs nothing and reads as
 * one more argument rather than a branch.
 */

/**
 * Excludes people the viewer cannot see, in either direction.
 *
 * The list comes off the request context, where it is resolved once. Pass the
 * column holding the *author* of whatever is being listed.
 */
export function notBlocked(column: PgColumn, blockedUserIds: readonly string[]): SQL | undefined {
  return blockedUserIds.length > 0 ? notInArray(column, [...blockedUserIds]) : undefined
}

/**
 * Excludes accounts that no longer exist.
 *
 * For queries that answer "who is there" -- search, member lists, suggestions.
 * Not for queries that list writing: a deleted account's reviews stay, under
 * an anonymous name, and filtering them here would empty the discussions they
 * are part of.
 */
export function notDeleted(): SQL | undefined {
  return isNull(schema.users.deletedAt)
}
