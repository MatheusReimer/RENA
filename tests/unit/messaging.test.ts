import { directKeyFor } from '@revy/core'
import { LIMITS, MESSAGE_POLL_MAX, RATE_LIMITS } from '@revy/shared/constants'
import {
  markConversationReadSchema,
  messageQuerySchema,
  sendMessageSchema,
  startConversationSchema,
} from '@revy/shared/schemas'
import { describe, expect, it } from 'vitest'

/**
 * Direct messaging contracts (SPEC 12, 25, 43).
 *
 * The service's authorization rules need a database and belong in integration
 * tests. What is testable here is everything that decides whether a request is
 * even allowed to reach them, plus the pair normalisation that makes "one
 * conversation per pair" hold.
 */

const UUID_A = '3f0c1a5e-9b2d-4c7a-8e1f-2b6d4a9c0e13'
const UUID_B = '7a1b2c3d-4e5f-4a6b-8c9d-0e1f2a3b4c5d'

describe('directKeyFor', () => {
  it('produces the same key whichever way round the pair is given', () => {
    // The whole reason the column exists: A messaging B and B messaging A must
    // collide on the unique index rather than creating two conversations.
    expect(directKeyFor(UUID_A, UUID_B)).toBe(directKeyFor(UUID_B, UUID_A))
  })

  it('distinguishes different pairs', () => {
    const third = 'b2c3d4e5-6f70-4a8b-9c0d-1e2f3a4b5c6d'
    expect(directKeyFor(UUID_A, UUID_B)).not.toBe(directKeyFor(UUID_A, third))
  })

  it('separates the two ids, so no two pairs can concatenate alike', () => {
    expect(directKeyFor(UUID_A, UUID_B)).toContain(':')
  })
})

describe('sendMessageSchema', () => {
  it('accepts an ordinary message', () => {
    expect(sendMessageSchema.parse({ content: 'have you read it yet?' }).content).toBe(
      'have you read it yet?',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(sendMessageSchema.parse({ content: '  hello  ' }).content).toBe('hello')
  })

  it('rejects an empty message', () => {
    expect(() => sendMessageSchema.parse({ content: '' })).toThrow()
  })

  it('rejects a whitespace-only message', () => {
    // Otherwise the trim leaves an empty body that still costs a row, a
    // notification and a bump to the top of the other person's list.
    expect(() => sendMessageSchema.parse({ content: '   \n\t ' })).toThrow()
  })

  it('rejects a message past the length limit', () => {
    const tooLong = 'a'.repeat(LIMITS.messageContent.max + 1)
    expect(() => sendMessageSchema.parse({ content: tooLong })).toThrow()
  })

  it('accepts a message exactly at the limit', () => {
    const exact = 'a'.repeat(LIMITS.messageContent.max)
    expect(sendMessageSchema.parse({ content: exact }).content).toHaveLength(
      LIMITS.messageContent.max,
    )
  })

  it('keeps markup as text rather than stripping it', () => {
    // SPEC 39: user content is stored raw and escaped at render. Sanitising on
    // input destroys legitimate text and gives false confidence.
    const markup = '<b>not bold</b>'
    expect(sendMessageSchema.parse({ content: markup }).content).toBe(markup)
  })
})

describe('messageQuerySchema', () => {
  it('defaults to a first page with no cursor', () => {
    const parsed = messageQuerySchema.parse({})
    expect(parsed.before).toBeUndefined()
    expect(parsed.after).toBeUndefined()
    expect(parsed.limit).toBeGreaterThan(0)
  })

  it('accepts a backwards cursor', () => {
    expect(messageQuerySchema.parse({ before: UUID_A }).before).toBe(UUID_A)
  })

  it('accepts a forwards cursor', () => {
    expect(messageQuerySchema.parse({ after: UUID_A }).after).toBe(UUID_A)
  })

  it('rejects both cursors at once', () => {
    // A request carrying both is a client bug; answering it with something
    // plausible would hide that.
    expect(() => messageQuerySchema.parse({ before: UUID_A, after: UUID_B })).toThrow()
  })

  it('rejects a cursor that is not a message id', () => {
    expect(() => messageQuerySchema.parse({ after: 'not-a-uuid' })).toThrow()
  })

  it('coerces a limit sent as a query string', () => {
    expect(messageQuerySchema.parse({ limit: '10' }).limit).toBe(10)
  })

  it('rejects a limit past the poll ceiling', () => {
    // The ceiling is what stops a tab left open all weekend asking for an
    // unbounded result set on its first tick back.
    expect(() => messageQuerySchema.parse({ limit: MESSAGE_POLL_MAX + 1 })).toThrow()
  })

  it('rejects a zero or negative limit', () => {
    expect(() => messageQuerySchema.parse({ limit: 0 })).toThrow()
    expect(() => messageQuerySchema.parse({ limit: -5 })).toThrow()
  })
})

describe('markConversationReadSchema', () => {
  it('requires a message id rather than accepting a timestamp', () => {
    // Reading up to "now" would mark messages read that arrived between the
    // render and the request.
    expect(() => markConversationReadSchema.parse({ messageId: '2026-01-01' })).toThrow()
    expect(markConversationReadSchema.parse({ messageId: UUID_A }).messageId).toBe(UUID_A)
  })
})

describe('startConversationSchema', () => {
  it('requires a user id', () => {
    expect(() => startConversationSchema.parse({})).toThrow()
    expect(() => startConversationSchema.parse({ userId: 'pedrofs' })).toThrow()
    expect(startConversationSchema.parse({ userId: UUID_A }).userId).toBe(UUID_A)
  })
})

describe('the message rate limit', () => {
  it('has a bucket of its own', () => {
    // Sharing `write` would mean posting a review could stop a conversation
    // mid-sentence, which is a failure nobody could explain.
    expect(RATE_LIMITS.message.bucket).not.toBe(RATE_LIMITS.write.bucket)
  })

  it('allows a real back-and-forth', () => {
    const perMinute = (RATE_LIMITS.message.limit / RATE_LIMITS.message.windowSeconds) * 60
    expect(perMinute).toBeGreaterThanOrEqual(30)
  })

  it('still bounds a script', () => {
    const perHour = (RATE_LIMITS.message.limit / RATE_LIMITS.message.windowSeconds) * 3600
    expect(perHour).toBeLessThan(10_000)
  })
})
