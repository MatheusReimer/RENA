import { ACTIVITY_TYPES, FEED_PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from '@revy/shared/constants'
import { feedQuerySchema } from '@revy/shared/schemas'
import { describe, expect, it } from 'vitest'

/**
 * The activity feed's query contract (SPEC 13, 25, 43).
 *
 * `scope` chooses whose activity and `type` chooses which kind. The two are
 * orthogonal, and these assert that they stay that way -- the friends screen
 * asks for friends' ratings by combining them, and a change that made one
 * imply the other would turn that screen into the home feed without failing
 * anything else.
 */

describe('feedQuerySchema', () => {
  it('defaults to everything, from everyone the viewer follows plus themselves', () => {
    const parsed = feedQuerySchema.parse({})
    expect(parsed.scope).toBe('for-you')
    // Undefined, not a list of every type: the home feed must not pay for a
    // predicate that excludes nothing.
    expect(parsed.type).toBeUndefined()
  })

  it('accepts the friends-only scope', () => {
    expect(feedQuerySchema.parse({ scope: 'following' }).scope).toBe('following')
  })

  it.each(ACTIVITY_TYPES)('accepts the %s type', (type) => {
    expect(feedQuerySchema.parse({ type }).type).toBe(type)
  })

  it('rejects a type that is not an activity', () => {
    // This value reaches a SQL predicate, and the set of things that can
    // appear in a feed is closed.
    expect(() => feedQuerySchema.parse({ type: 'rated' })).toThrow()
    expect(() => feedQuerySchema.parse({ type: 'DROP TABLE activities' })).toThrow()
  })

  it('combines scope and type without either overriding the other', () => {
    // Exactly what the friends screen sends.
    const parsed = feedQuerySchema.parse({ scope: 'following', type: 'rated_media' })
    expect(parsed).toMatchObject({ scope: 'following', type: 'rated_media' })
  })

  it('carries a cursor through unchanged', () => {
    const cursor = '2026-01-01T00:00:00.000Z'
    expect(feedQuerySchema.parse({ cursor }).cursor).toBe(cursor)
  })

  it('coerces a limit sent as a query string', () => {
    expect(feedQuerySchema.parse({ limit: '15' }).limit).toBe(15)
  })

  it('refuses a page larger than the maximum', () => {
    // An unbounded page is a feed request that fans out over every friend and
    // returns the whole history in one response.
    expect(() => feedQuerySchema.parse({ limit: PAGE_SIZE_MAX + 1 })).toThrow()
  })

  it('keeps the feed page smaller than the generic one', () => {
    // Feed rows carry artwork, so they are more expensive to render than the
    // list rows PAGE_SIZE_DEFAULT was chosen for.
    expect(FEED_PAGE_SIZE_DEFAULT).toBeLessThan(PAGE_SIZE_MAX)
  })
})
