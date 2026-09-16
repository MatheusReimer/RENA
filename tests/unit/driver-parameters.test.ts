import type { Executor } from '@revy/db'
import {
  byGenres,
  communityReviews,
  discoverRepository,
  hiddenGems,
  mostDiscussed,
} from '@revy/core'
import { drizzle } from 'drizzle-orm/pg-proxy'
import { describe, expect, it } from 'vitest'

/**
 * What the queries actually hand the driver.
 *
 * This product runs on two Postgres drivers: PGlite in development and on
 * every laptop, postgres-js in production. They agree about SQL and disagree
 * about JavaScript values -- PGlite will serialise a `Date` parameter and
 * postgres-js throws `The "string" argument must be of type string ...
 * Received an instance of Date`.
 *
 * That difference took the Explore screen down in production while every test
 * and every laptop stayed green, because the query was *correct* -- it was the
 * value bound into it that only one driver accepted. Nothing else in this
 * suite can see that: the SQL is right, the schema is right, the data is
 * right, and it still 500s.
 *
 * So these tests assert the shape of the bound parameters rather than the
 * shape of the SQL. A value bound through a column is encoded by that column's
 * type on the way out; a value interpolated into a raw `sql` fragment is not,
 * and arrives as whatever it was. Only the second kind can go wrong, and it
 * goes wrong in exactly one place a test can still reach.
 */

/** A database that answers nothing and remembers what it was asked. */
function recordingDb() {
  const calls: { sql: string; params: readonly unknown[] }[] = []

  const db = drizzle(async (sql, params) => {
    calls.push({ sql, params })
    return { rows: [] }
  }) as unknown as Executor

  return { db, calls }
}

/**
 * Parameters no driver is guaranteed to understand.
 *
 * Primitives are safe everywhere. Anything still an object by the time it
 * reaches the driver -- a `Date` above all -- is relying on that particular
 * driver's serialiser, which is the bug this file exists for.
 */
function unencoded(params: readonly unknown[]): unknown[] {
  return params.filter((param) => param !== null && typeof param === 'object')
}

describe('parameters bound by the Explore queries', () => {
  it('sends the activity window as an encoded value, not a Date', async () => {
    /*
     * The regression. `mostDiscussed` builds its 30-day window inside a raw
     * `sql` fragment, where there is no column to encode it, so a `Date` here
     * reaches postgres-js untouched and the request fails in production only.
     */
    const { db, calls } = recordingDb()
    await mostDiscussed(db, null, 8)

    expect(calls).toHaveLength(1)
    expect(unencoded(calls[0]!.params)).toEqual([])
  })

  it('does the same when the screen is filtered to one media type', async () => {
    // The chips at the top of Explore take this branch, and it binds an extra
    // parameter -- a different query, the same hazard.
    const { db, calls } = recordingDb()
    await mostDiscussed(db, 'movie', 8)

    expect(unencoded(calls[0]!.params)).toEqual([])
  })

  it('binds nothing a driver could refuse in the other Explore rows', async () => {
    const { db, calls } = recordingDb()

    await hiddenGems(db, null, 6)
    await byGenres(db, ['Drama', 'Crime'], ['movie'], 12)
    await communityReviews(db, 12)

    for (const call of calls) {
      expect(unencoded(call.params), call.sql.slice(0, 80)).toEqual([])
    }
  })
})

describe('parameters bound through a column', () => {
  it('are encoded by the column, which is why those were never the bug', async () => {
    /*
     * `discoverRepository.trending` has the same 30-day window as
     * `mostDiscussed` and has always worked in production, because it compares
     * against `schema.ratings.createdAt` with `gte()` rather than pasting the
     * value into raw SQL. Drizzle encodes it on the way out.
     *
     * Asserted here so this file cannot quietly become vacuous: if encoding
     * ever stopped happening, this is the test that would say so, and the
     * others would still pass by binding nothing at all.
     */
    const { db, calls } = recordingDb()
    await discoverRepository.trending(db, null, 10)

    const bound = calls.flatMap((call) => call.params)
    expect(bound.some((param) => typeof param === 'string')).toBe(true)
    expect(unencoded(bound)).toEqual([])
  })
})
