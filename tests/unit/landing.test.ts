import { describe, expect, it } from 'vitest'
import { averageScore, toCommunityReview, toTrendingTile } from '@revy/core'

/**
 * The landing screen's projections.
 *
 * Everything the landing page prints about a title or a review passes through
 * one of these three mappers, and each of them has a way of quietly lying: an
 * unrated title can be made to look hated, a review can be cut through the
 * middle of a word, and a score stored as half-steps can be printed as twice
 * what its author gave. These are the tests for those three things.
 */

describe('averageScore', () => {
  it('converts a sum of half-steps back to the 0.5-5.0 scale', () => {
    // Four ratings totalling 36 half-steps: a mean of 9 half-steps, so 4.5.
    expect(averageScore(36, 4)).toBe(4.5)
  })

  it('rounds to a single decimal, the way the UI prints it', () => {
    // 25 half-steps over 3 ratings is 4.1666...
    expect(averageScore(25, 3)).toBe(4.2)
  })

  it('answers null for an unrated title rather than zero', () => {
    // 0.0 is a verdict -- it says the community hated the thing. "Nobody has
    // said yet" is not a verdict, and the two must not share a representation
    // on a page that prints one of them next to a star.
    expect(averageScore(0, 0)).toBeNull()
  })

  it('answers null rather than dividing by a negative count', () => {
    expect(averageScore(10, -1)).toBeNull()
  })
})

describe('toTrendingTile', () => {
  const row = {
    id: 'media-1',
    mediaType: 'movie' as const,
    title: 'Dune: Part Two',
    coverImageUrl: 'https://image.tmdb.org/t/p/original/cover.jpg',
    releaseDate: '2024-03-01',
    ratingCount: 4,
    ratingSum: 36,
  }

  it('carries the rating through as a readable average', () => {
    expect(toTrendingTile(row)).toMatchObject({ ratingAverage: 4.5, ratingCount: 4 })
  })

  it('reduces a release date to the year the rail actually prints', () => {
    expect(toTrendingTile(row).releaseYear).toBe('2024')
  })

  it('survives a title whose provider supplied no release date', () => {
    // Steam supplies none at list scale, so this is the common case for games
    // rather than an edge one.
    expect(toTrendingTile({ ...row, releaseDate: null }).releaseYear).toBe('')
  })

  it('treats a title with no stats row as unrated, not as broken', () => {
    // The stats table is LEFT JOINed, so both columns come back null for
    // anything nobody has ever rated.
    expect(toTrendingTile({ ...row, ratingCount: null, ratingSum: null })).toMatchObject({
      ratingAverage: null,
      ratingCount: 0,
    })
  })

  it('does not leak the columns the rail has no use for', () => {
    expect(Object.keys(toTrendingTile(row)).sort()).toEqual([
      'coverImageUrl',
      'id',
      'mediaType',
      'ratingAverage',
      'ratingCount',
      'releaseYear',
      'title',
    ])
  })
})

describe('toCommunityReview', () => {
  const row = {
    id: 'review-1',
    content: 'It spends three hours earning an ending it could have bought in twenty minutes.',
    likeCount: 12,
    commentCount: 3,
    createdAt: new Date('2026-09-14T07:00:00.000Z'),
    mediaTitle: 'Dune: Part Two',
    score: 9,
    authorId: 'user-1',
    authorUsername: 'ada',
    authorDisplayName: 'Ada Lovelace',
    authorAvatarUrl: null,
  }

  it('converts the stored half-steps to the score people read', () => {
    expect(toCommunityReview(row).score).toBe(4.5)
  })

  it('keeps a review written without a score', () => {
    // The rating is LEFT JOINed precisely so these survive. Dropping them
    // would quietly bias the section towards people who rate as well as write.
    expect(toCommunityReview({ ...row, score: null }).score).toBeNull()
  })

  it('returns only the public fields of the author', () => {
    expect(toCommunityReview(row).author).toEqual({
      id: 'user-1',
      username: 'ada',
      displayName: 'Ada Lovelace',
      avatarUrl: null,
    })
  })

  it('sends the timestamp as an ISO string, not a Date', () => {
    // Dates do not survive the JSON boundary; a Date here becomes a string on
    // the client anyway, and the type should say so rather than lie about it.
    expect(toCommunityReview(row).createdAt).toBe('2026-09-14T07:00:00.000Z')
  })

  it('leaves a short review exactly as it was written', () => {
    expect(toCommunityReview(row).quote).toBe(row.content)
  })

  it('trims a long review on a word boundary', () => {
    const long = `${'word '.repeat(60)}end`
    const { quote } = toCommunityReview({ ...row, content: long })

    expect(quote.length).toBeLessThanOrEqual(151)
    expect(quote.endsWith('…')).toBe(true)
    // Cut between words, never through one.
    expect(quote).not.toMatch(/wor…$/)
  })
})
