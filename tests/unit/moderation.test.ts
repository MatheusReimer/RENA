import { notBlocked } from '@revy/core'
import { schema } from '@revy/db'
import {
  DELETED_ACCOUNT_NAME,
  DELETED_ACCOUNT_PREFIX,
  MODERATION_EMAIL,
  REPORT_NOTE_MAX,
  REPORT_REASONS,
  REPORT_TARGETS,
} from '@revy/shared/constants'
import { deleteAccountSchema, reportSchema } from '@revy/shared/schemas'
import { VERIFY_WALL_OPEN_PATHS, verifyWallRedirect } from '@revy/shared/utils'
import { describe, expect, it } from 'vitest'

/**
 * Blocking, reporting and leaving.
 *
 * All three exist because both stores refuse an app that carries other
 * people's writing without them, so the tests are about the rules being
 * honoured rather than about the wiring: a block that quietly stops filtering,
 * or a report form that accepts a target type the server cannot resolve, is
 * the kind of failure nothing else in the suite would catch.
 */

describe('the blocked-user filter', () => {
  it('adds nothing when nobody is blocked', () => {
    /*
     * The common case by a very long way, and the one that has to cost
     * nothing: `notInArray(column, [])` is not a no-op in SQL -- depending on
     * the dialect it is either an error or a condition that excludes every
     * row, which would empty every feed in the product.
     */
    expect(notBlocked(schema.reviews.userId, [])).toBeUndefined()
  })

  it('produces a condition once somebody is blocked', () => {
    const condition = notBlocked(schema.reviews.userId, ['8f1c0e7a-0000-4000-8000-000000000000'])
    expect(condition).toBeDefined()
  })
})

describe('the report form', () => {
  it('accepts every reason and target the product offers', () => {
    // The enum, the Zod schema and the database type are generated from one
    // list; this is what proves they have not drifted apart.
    for (const targetType of REPORT_TARGETS) {
      for (const reason of REPORT_REASONS) {
        const parsed = reportSchema.safeParse({
          targetType,
          reason,
          targetId: '8f1c0e7a-0000-4000-8000-000000000000',
        })
        expect(parsed.success, `${targetType}/${reason}`).toBe(true)
      }
    }
  })

  it('refuses a target type the server could not resolve an author for', () => {
    const parsed = reportSchema.safeParse({
      targetType: 'profile_picture',
      reason: 'spam',
      targetId: '8f1c0e7a-0000-4000-8000-000000000000',
    })
    expect(parsed.success).toBe(false)
  })

  it('refuses a target id that is not an id', () => {
    // The id reaches a query that resolves who wrote the reported thing.
    const parsed = reportSchema.safeParse({
      targetType: 'review',
      reason: 'spam',
      targetId: 'the-one-about-dune',
    })
    expect(parsed.success).toBe(false)
  })

  it('takes a note, trims it, and stops it running away', () => {
    const parsed = reportSchema.parse({
      targetType: 'review',
      reason: 'other',
      targetId: '8f1c0e7a-0000-4000-8000-000000000000',
      note: '  they keep posting endings  ',
    })
    expect(parsed.note).toBe('they keep posting endings')

    const tooLong = reportSchema.safeParse({
      targetType: 'review',
      reason: 'other',
      targetId: '8f1c0e7a-0000-4000-8000-000000000000',
      note: 'x'.repeat(REPORT_NOTE_MAX + 1),
    })
    expect(tooLong.success).toBe(false)
  })
})

describe('deleting an account', () => {
  it('requires the username to be typed back', () => {
    // The confirmation is the difference between meaning it and tapping twice,
    // and it is checked on the server as well as in the form.
    expect(deleteAccountSchema.safeParse({}).success).toBe(false)
    expect(deleteAccountSchema.safeParse({ confirmUsername: '' }).success).toBe(false)
    expect(deleteAccountSchema.safeParse({ confirmUsername: 'matheusr' }).success).toBe(true)
  })

  it('is reachable from behind the confirm-your-address wall', () => {
    /*
     * Somebody who signed up with a typo in their address can never confirm
     * it. Both stores require that leaving is possible from inside the app, so
     * the wall must not also block the exit.
     */
    expect(VERIFY_WALL_OPEN_PATHS).toContain('/settings')
    expect(verifyWallRedirect('/settings', { signedIn: true, emailVerified: false })).toBeNull()
  })

  it('names the anonymous account the same way everywhere', () => {
    // The display name is what a reader sees on an old comment; the prefix is
    // what keeps the freed username unique. Both are shared so the service,
    // the tests and the copy cannot disagree.
    expect(DELETED_ACCOUNT_NAME).toBeTruthy()
    expect(DELETED_ACCOUNT_PREFIX.endsWith('-')).toBe(true)
  })
})

describe('the published contact address', () => {
  it('is a real address on the product domain', () => {
    // Printed in the privacy policy and in both store listings. A contact
    // address nobody reads is worse than none, because it is a promise.
    expect(MODERATION_EMAIL).toMatch(/^[^@\s]+@rena\.reviews$/)
  })
})
