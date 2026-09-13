import { LIMITS, LIST_VISIBILITIES } from '@revy/shared/constants'
import {
  addListItemSchema,
  createListSchema,
  reorderListSchema,
  updateListSchema,
} from '@revy/shared/schemas'
import { describe, expect, it } from 'vitest'

/** List contracts (SPEC 15, 43). */

const UUID_A = '3f0c1a5e-9b2d-4c7a-8e1f-2b6d4a9c0e13'
const UUID_B = '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d'

describe('createListSchema', () => {
  it('defaults a new list to private', () => {
    // The safe default: a list should never become visible by accident.
    const result = createListSchema.safeParse({ name: 'To Watch' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.visibility).toBe('private')
  })

  it('accepts every visibility', () => {
    for (const visibility of LIST_VISIBILITIES) {
      expect(createListSchema.safeParse({ name: 'X', visibility }).success).toBe(true)
    }
  })

  it('rejects an unknown visibility', () => {
    expect(createListSchema.safeParse({ name: 'X', visibility: 'everyone' }).success).toBe(
      false,
    )
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(createListSchema.safeParse({ name: '' }).success).toBe(false)
    expect(createListSchema.safeParse({ name: '    ' }).success).toBe(false)
  })

  it('trims the name', () => {
    const result = createListSchema.safeParse({ name: '  Favorites  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.name).toBe('Favorites')
  })

  it('enforces the length limits', () => {
    expect(
      createListSchema.safeParse({ name: 'a'.repeat(LIMITS.listName.max + 1) }).success,
    ).toBe(false)
    expect(
      createListSchema.safeParse({
        name: 'X',
        description: 'a'.repeat(LIMITS.listDescription.max + 1),
      }).success,
    ).toBe(false)
  })
})

describe('updateListSchema', () => {
  it('accepts a single field', () => {
    expect(updateListSchema.safeParse({ name: 'Renamed' }).success).toBe(true)
    expect(updateListSchema.safeParse({ visibility: 'public' }).success).toBe(true)
  })

  it('rejects an empty patch', () => {
    // An empty body means the caller has a bug; silently succeeding hides it.
    expect(updateListSchema.safeParse({}).success).toBe(false)
  })
})

describe('addListItemSchema', () => {
  it('requires a uuid media id', () => {
    expect(addListItemSchema.safeParse({ mediaId: UUID_A }).success).toBe(true)
    expect(addListItemSchema.safeParse({ mediaId: 'dune' }).success).toBe(false)
  })

  it('allows an optional note', () => {
    const result = addListItemSchema.safeParse({ mediaId: UUID_A, note: 'Start here.' })
    expect(result.success).toBe(true)
  })

  it('has no position field for a client to supply', () => {
    // Ordering is the server's business: positions are assigned on append and
    // rewritten by reorder. A client-supplied position could collide or leave
    // gaps that no longer sort.
    const result = addListItemSchema.safeParse({ mediaId: UUID_A, position: 5 })
    expect(result.success).toBe(true)
    if (result.success) expect('position' in result.data).toBe(false)
  })
})

describe('reorderListSchema', () => {
  it('accepts a full sequence of item ids', () => {
    expect(reorderListSchema.safeParse({ itemIds: [UUID_A, UUID_B] }).success).toBe(true)
  })

  it('rejects an empty order', () => {
    expect(reorderListSchema.safeParse({ itemIds: [] }).success).toBe(false)
  })

  it('rejects non-uuid entries', () => {
    expect(reorderListSchema.safeParse({ itemIds: [UUID_A, 'second'] }).success).toBe(false)
  })

  it('caps the number of items to reorder', () => {
    const tooMany = Array.from({ length: 501 }, () => UUID_A)
    expect(reorderListSchema.safeParse({ itemIds: tooMany }).success).toBe(false)
  })
})

describe('updateListSchema does not invent values', () => {
  it('never fabricates a visibility the caller did not send', () => {
    // Regression: deriving this from createListSchema.partial() left the
    // .default('private') in place, so PATCH {} parsed to
    // { visibility: 'private' } and silently made a public list private.
    const result = updateListSchema.safeParse({ name: 'Renamed' })
    expect(result.success).toBe(true)
    if (result.success) expect('visibility' in result.data).toBe(false)
  })

  it('passes an explicit visibility through unchanged', () => {
    const result = updateListSchema.safeParse({ visibility: 'public' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.visibility).toBe('public')
  })
})
