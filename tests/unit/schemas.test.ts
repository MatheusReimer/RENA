import { LIMITS, RESERVED_USERNAMES } from '@revy/shared/constants'
import {
  createReviewSchema,
  sendFriendRequestSchema,
  upsertRatingSchema,
  usernameSchema,
} from '@revy/shared/schemas'
import { describe, expect, it } from 'vitest'

/**
 * Server-side validation contracts (SPEC 25, 43).
 *
 * These are the rules that actually protect the database, so the cases here
 * are the ones a malicious client would try -- not just the happy path.
 */

const UUID = '3f0c1a5e-9b2d-4c7a-8e1f-2b6d4a9c0e13'

describe('upsertRatingSchema', () => {
  it('accepts a legal score', () => {
    const result = upsertRatingSchema.safeParse({ mediaId: UUID, score: 4.5 })
    expect(result.success).toBe(true)
  })

  it('rejects an off-increment score', () => {
    const result = upsertRatingSchema.safeParse({ mediaId: UUID, score: 3.7 })
    expect(result.success).toBe(false)
  })

  it('rejects a score outside the scale', () => {
    expect(upsertRatingSchema.safeParse({ mediaId: UUID, score: 0 }).success).toBe(false)
    expect(upsertRatingSchema.safeParse({ mediaId: UUID, score: 6 }).success).toBe(false)
  })

  it('rejects a non-uuid media id', () => {
    expect(upsertRatingSchema.safeParse({ mediaId: 'dune', score: 4 }).success).toBe(false)
  })

  it('rejects a score sent as a string', () => {
    // No coercion on this field: '4.5' from a form must be converted by the
    // client, not silently accepted by the server.
    expect(upsertRatingSchema.safeParse({ mediaId: UUID, score: '4.5' }).success).toBe(false)
  })
})

describe('usernameSchema', () => {
  it('accepts a normal username', () => {
    expect(usernameSchema.safeParse('pedrofs').success).toBe(true)
    expect(usernameSchema.safeParse('user_123').success).toBe(true)
  })

  it('rejects reserved names case-insensitively', () => {
    expect(usernameSchema.safeParse('admin').success).toBe(false)
    expect(usernameSchema.safeParse('ADMIN').success).toBe(false)
    expect(usernameSchema.safeParse('Settings').success).toBe(false)
  })

  it('covers every reserved name', () => {
    for (const reserved of RESERVED_USERNAMES) {
      // Only names that would otherwise be structurally valid are meaningful
      // here; all current entries are.
      if (reserved.length < LIMITS.username.min) continue
      expect(usernameSchema.safeParse(reserved).success, reserved).toBe(false)
    }
  })

  it('rejects characters that would break routing or display', () => {
    expect(usernameSchema.safeParse('pedro fs').success).toBe(false)
    expect(usernameSchema.safeParse('pedro/fs').success).toBe(false)
    expect(usernameSchema.safeParse('pedro@fs').success).toBe(false)
    expect(usernameSchema.safeParse('<script>').success).toBe(false)
  })

  it('enforces length bounds', () => {
    expect(usernameSchema.safeParse('ab').success).toBe(false)
    expect(usernameSchema.safeParse('a'.repeat(LIMITS.username.max + 1)).success).toBe(false)
  })
})

describe('createReviewSchema', () => {
  it('defaults the spoiler flag to false rather than undefined', () => {
    const result = createReviewSchema.safeParse({ mediaId: UUID, content: 'Great film.' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.spoiler).toBe(false)
  })

  it('rejects a whitespace-only review', () => {
    expect(createReviewSchema.safeParse({ mediaId: UUID, content: '   ' }).success).toBe(false)
  })

  it('trims surrounding whitespace', () => {
    const result = createReviewSchema.safeParse({ mediaId: UUID, content: '  Good.  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.content).toBe('Good.')
  })

  it('rejects content past the length limit', () => {
    const tooLong = 'a'.repeat(LIMITS.reviewContent.max + 1)
    expect(createReviewSchema.safeParse({ mediaId: UUID, content: tooLong }).success).toBe(false)
  })

  it('preserves markup as text rather than stripping it', () => {
    // SPEC 39: content is stored raw and escaped at render time. Sanitising on
    // input would mangle legitimate text and give false confidence.
    const content = 'The <best> film & a 5/5'
    const result = createReviewSchema.safeParse({ mediaId: UUID, content })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.content).toBe(content)
  })

  it('rejects an attached score that is off the scale', () => {
    expect(
      createReviewSchema.safeParse({ mediaId: UUID, content: 'Good.', score: 4.2 }).success,
    ).toBe(false)
  })
})

describe('sendFriendRequestSchema', () => {
  it('requires a uuid', () => {
    expect(sendFriendRequestSchema.safeParse({ userId: UUID }).success).toBe(true)
    expect(sendFriendRequestSchema.safeParse({ userId: 'pedro' }).success).toBe(false)
  })
})
