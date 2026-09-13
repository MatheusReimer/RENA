import { buildCommentTree } from '@revy/core'
import { COMMENT_MAX_DEPTH, LIMITS } from '@revy/shared/constants'
import { createCommentSchema, createThreadSchema } from '@revy/shared/schemas'
import type { DiscussionComment } from '@revy/shared/types'
import { describe, expect, it } from 'vitest'

/** Discussion nesting and validation (SPEC 14, 43). */

const UUID_A = '3f0c1a5e-9b2d-4c7a-8e1f-2b6d4a9c0e13'
const UUID_B = '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d'

function comment(
  id: string,
  parentCommentId: string | null,
  depth: number,
  createdAt = '2026-01-01T00:00:00.000Z',
): DiscussionComment {
  return {
    id,
    threadId: 't1',
    user: { id: 'u1', username: 'pedrofs', displayName: 'Pedro', avatarUrl: null },
    parentCommentId,
    content: `comment ${id}`,
    spoiler: false,
    depth,
    replyCount: 0,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('buildCommentTree', () => {
  it('returns top-level comments as roots', () => {
    const tree = buildCommentTree([comment('a', null, 0), comment('b', null, 0)])
    expect(tree.map((node) => node.id)).toEqual(['a', 'b'])
    expect(tree.every((node) => node.replies.length === 0)).toBe(true)
  })

  it('nests replies under their parent', () => {
    const tree = buildCommentTree([
      comment('a', null, 0),
      comment('b', 'a', 1),
      comment('c', 'b', 2),
    ])

    expect(tree).toHaveLength(1)
    expect(tree[0]!.replies[0]!.id).toBe('b')
    expect(tree[0]!.replies[0]!.replies[0]!.id).toBe('c')
  })

  it('keeps siblings in their original order', () => {
    const tree = buildCommentTree([
      comment('a', null, 0),
      comment('b', 'a', 1, '2026-01-01T00:01:00.000Z'),
      comment('c', 'a', 1, '2026-01-01T00:02:00.000Z'),
    ])

    expect(tree[0]!.replies.map((node) => node.id)).toEqual(['b', 'c'])
  })

  it('handles the full nesting depth', () => {
    const comments = [comment('c0', null, 0)]
    for (let depth = 1; depth <= COMMENT_MAX_DEPTH; depth++) {
      comments.push(comment(`c${depth}`, `c${depth - 1}`, depth))
    }

    let node = buildCommentTree(comments)[0]!
    for (let depth = 1; depth <= COMMENT_MAX_DEPTH; depth++) {
      expect(node.replies).toHaveLength(1)
      node = node.replies[0]!
      expect(node.depth).toBe(depth)
    }
  })

  it('promotes an orphan to the top level rather than dropping it', () => {
    // A parent deleted between the two reads. Losing someone's words silently
    // is worse than showing them slightly out of place.
    const tree = buildCommentTree([comment('a', null, 0), comment('orphan', 'deleted', 1)])

    expect(tree.map((node) => node.id)).toEqual(['a', 'orphan'])
  })

  it('never loses a comment', () => {
    const comments = [
      comment('a', null, 0),
      comment('b', 'a', 1),
      comment('c', null, 0),
      comment('d', 'b', 2),
      comment('e', 'missing', 1),
    ]

    let seen = 0
    const walk = (nodes: ReturnType<typeof buildCommentTree>) => {
      for (const node of nodes) {
        seen++
        walk(node.replies)
      }
    }
    walk(buildCommentTree(comments))

    expect(seen).toBe(comments.length)
  })

  it('returns an empty tree for an empty thread', () => {
    expect(buildCommentTree([])).toEqual([])
  })
})

describe('createThreadSchema', () => {
  it('accepts a title with no opening message', () => {
    const result = createThreadSchema.safeParse({
      mediaId: UUID_A,
      title: 'Is the second movie better?',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.spoiler).toBe(false)
  })

  it('rejects a title that is too short to mean anything', () => {
    expect(createThreadSchema.safeParse({ mediaId: UUID_A, title: 'hm' }).success).toBe(false)
  })

  it('rejects a title past the length limit', () => {
    const title = 'a'.repeat(LIMITS.discussionTitle.max + 1)
    expect(createThreadSchema.safeParse({ mediaId: UUID_A, title }).success).toBe(false)
  })

  it('rejects a whitespace-only title', () => {
    expect(
      createThreadSchema.safeParse({ mediaId: UUID_A, title: '          ' }).success,
    ).toBe(false)
  })
})

describe('createCommentSchema', () => {
  it('defaults to a top-level comment', () => {
    const result = createCommentSchema.safeParse({ content: 'Agreed.' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.parentCommentId ?? null).toBe(null)
      expect(result.data.spoiler).toBe(false)
    }
  })

  it('accepts a reply to a specific comment', () => {
    const result = createCommentSchema.safeParse({
      content: 'Disagree, but fair.',
      parentCommentId: UUID_B,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a non-uuid parent', () => {
    expect(
      createCommentSchema.safeParse({ content: 'Hi', parentCommentId: 'nope' }).success,
    ).toBe(false)
  })

  it('rejects empty and overlong content', () => {
    expect(createCommentSchema.safeParse({ content: '   ' }).success).toBe(false)
    expect(
      createCommentSchema.safeParse({ content: 'a'.repeat(LIMITS.commentContent.max + 1) })
        .success,
    ).toBe(false)
  })

  it('has no depth field for a client to supply', () => {
    // SPEC 25: depth is derived from the parent server-side. If it ever became
    // an accepted input, a client could post past COMMENT_MAX_DEPTH.
    const result = createCommentSchema.safeParse({ content: 'Hi', depth: 99 })
    expect(result.success).toBe(true)
    if (result.success) expect('depth' in result.data).toBe(false)
  })
})
