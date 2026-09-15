import {
  BADGE_DEFINITIONS,
  MEDIA_STATUSES,
  MEDIA_STATUS_LABELS,
  MEDIA_TYPES,
  MEDIA_TYPE_LABELS,
  MEDIA_TYPE_PLURALS,
  MEDIA_TYPE_VERBS,
} from '@revy/shared/constants'
import { mediaTypeLabel, statusLabel } from '@revy/shared/utils'
import { describe, expect, it } from 'vitest'

/**
 * Media type completeness (SPEC 7, 49.11).
 *
 * SPEC 49.11 requires the model stay open to new media types. TypeScript
 * catches a missing key in a `Record<MediaType, …>`, but the label tables are
 * `as const` object literals, where a missing entry is only a runtime hole --
 * a type would silently render "undefined" in the UI.
 *
 * These tests are the guard. Adding a fifth media type should fail here first,
 * with a message naming exactly what is missing.
 */

describe('every media type is fully described', () => {
  it.each(MEDIA_TYPES)('%s has a display label', (type) => {
    expect(MEDIA_TYPE_LABELS[type], `MEDIA_TYPE_LABELS is missing "${type}"`).toBeTruthy()
    expect(mediaTypeLabel(type)).toBe(MEDIA_TYPE_LABELS[type])
  })

  it.each(MEDIA_TYPES)('%s has a label for every consumption status', (type) => {
    for (const status of MEDIA_STATUSES) {
      expect(
        MEDIA_STATUS_LABELS[type]?.[status],
        `MEDIA_STATUS_LABELS["${type}" is missing "${status}"`,
      ).toBeTruthy()
      expect(statusLabel(type, status)).toBe(MEDIA_STATUS_LABELS[type][status])
    }
  })

  it.each(MEDIA_TYPES)('%s has present and past tense verbs', (type) => {
    expect(MEDIA_TYPE_VERBS[type]?.present, `missing present verb for "${type}"`).toBeTruthy()
    expect(MEDIA_TYPE_VERBS[type]?.past, `missing past verb for "${type}"`).toBeTruthy()
  })
})

describe('status wording is type-appropriate', () => {
  it('uses watch / read / play for the planned state', () => {
    expect(statusLabel('movie', 'planned')).toBe('Want to watch')
    expect(statusLabel('book', 'planned')).toBe('Want to read')
    expect(statusLabel('game', 'planned')).toBe('Want to play')
  })

  it('never leaks a generic status name into the UI', () => {
    // 'in_progress' is the storage value; a user should never see it.
    for (const type of MEDIA_TYPES) {
      for (const status of MEDIA_STATUSES) {
        expect(statusLabel(type, status)).not.toContain('_')
      }
    }
  })
})

describe('per-type badges', () => {
  it('every media type has a "first" badge', () => {
    const covered = new Set(
      BADGE_DEFINITIONS.filter((b) => b.requirementType === 'rating_count_of_type').map(
        (b) => b.requirementMediaType,
      ),
    )

    for (const type of MEDIA_TYPES) {
      expect(covered.has(type), `no per-type badge for "${type}"`).toBe(true)
    }
  })

  it('badge slugs are unique', () => {
    const slugs = BADGE_DEFINITIONS.map((b) => b.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('a per-type badge always names its type', () => {
    for (const badge of BADGE_DEFINITIONS) {
      if (badge.requirementType === 'rating_count_of_type') {
        expect(badge.requirementMediaType, `${badge.slug} has no media type`).toBeDefined()
      }
    }
  })
})

describe('plural labels', () => {
  it('every media type has one', () => {
    for (const type of MEDIA_TYPES) {
      expect(MEDIA_TYPE_PLURALS[type], `no plural for "${type}"`).toBeTruthy()
    }
  })

  it('does not produce "seriess"', () => {
    // The bug this exists to prevent: appending "s" to the singular label.
    // English has enough irregular plurals that deriving them is a trap.
    expect(MEDIA_TYPE_PLURALS.series).toBe('TV Shows')
    for (const type of MEDIA_TYPES) {
      expect(MEDIA_TYPE_PLURALS[type]).not.toMatch(/ss$/)
    }
  })

  it('differs from the singular where English says it should', () => {
    expect(MEDIA_TYPE_PLURALS.movie).not.toBe(MEDIA_TYPE_LABELS.movie)
    expect(MEDIA_TYPE_PLURALS.book).not.toBe(MEDIA_TYPE_LABELS.book)
    expect(MEDIA_TYPE_PLURALS.game).not.toBe(MEDIA_TYPE_LABELS.game)
  })
})
