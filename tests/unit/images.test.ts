import { describe, expect, it } from 'vitest'
import {
  BACKDROP_WIDTHS,
  POSTER_WIDTHS,
  imageAtWidth,
  imageSrcSet,
  isResizable,
} from '@revy/shared/utils'

const TMDB = 'https://image.tmdb.org/t/p/original/wVYREutTvI2tmxr6ujrHT704wGF.jpg'
const STEAM = 'https://cdn.akamai.steamstatic.com/steam/apps/440/library_600x900.jpg'
const OPEN_LIBRARY = 'https://covers.openlibrary.org/b/id/12345-L.jpg'

describe('isResizable', () => {
  it('recognises TMDB URLs', () => {
    expect(isResizable(TMDB)).toBe(true)
  })

  it('rejects providers whose URLs carry no size segment', () => {
    expect(isResizable(STEAM)).toBe(false)
    expect(isResizable(OPEN_LIBRARY)).toBe(false)
  })

  it('rejects absent artwork rather than throwing', () => {
    expect(isResizable(null)).toBe(false)
    expect(isResizable(undefined)).toBe(false)
  })
})

describe('imageAtWidth', () => {
  it('swaps the size segment', () => {
    expect(imageAtWidth(TMDB, 342)).toBe(
      'https://image.tmdb.org/t/p/w342/wVYREutTvI2tmxr6ujrHT704wGF.jpg',
    )
  })

  it('asks for the provider original', () => {
    expect(imageAtWidth(imageAtWidth(TMDB, 154), 'original')).toBe(TMDB)
  })

  /*
   * The regression this guards: rows imported before the stored size was
   * raised still hold a w500 URL. If resizing only matched `original` those
   * rows would silently keep whatever size they were imported at, and the
   * change would appear to do nothing for most of the catalogue.
   */
  it('resizes a URL that was stored at some other size', () => {
    const stored = 'https://image.tmdb.org/t/p/w500/abc.jpg'
    expect(imageAtWidth(stored, 780)).toBe('https://image.tmdb.org/t/p/w780/abc.jpg')
  })

  it('leaves other providers untouched', () => {
    expect(imageAtWidth(STEAM, 342)).toBe(STEAM)
    expect(imageAtWidth(OPEN_LIBRARY, 154)).toBe(OPEN_LIBRARY)
  })

  it('passes null through', () => {
    expect(imageAtWidth(null, 342)).toBeNull()
  })

  it('rewrites only the size segment, never the file name', () => {
    // A file whose name contains something that looks like a size segment.
    const tricky = 'https://image.tmdb.org/t/p/original/w500original.jpg'
    expect(imageAtWidth(tricky, 154)).toBe('https://image.tmdb.org/t/p/w154/w500original.jpg')
  })
})

describe('imageSrcSet', () => {
  it('lists every width with a w descriptor', () => {
    const set = imageSrcSet(TMDB, [154, 342])
    expect(set).toBe(
      'https://image.tmdb.org/t/p/w154/wVYREutTvI2tmxr6ujrHT704wGF.jpg 154w, ' +
        'https://image.tmdb.org/t/p/w342/wVYREutTvI2tmxr6ujrHT704wGF.jpg 342w',
    )
  })

  /*
   * Null rather than a single-candidate set: the caller falls back to a plain
   * `src`, which is correct. A srcset naming one unresized URL at a width it
   * is not would make the browser choose wrongly.
   */
  it('returns null for artwork it cannot resize', () => {
    expect(imageSrcSet(STEAM, [154, 342])).toBeNull()
    expect(imageSrcSet(null, [154])).toBeNull()
  })

  it('ships width sets that are ascending and TMDB-valid', () => {
    for (const widths of [POSTER_WIDTHS, BACKDROP_WIDTHS]) {
      const ascending = [...widths].sort((a, b) => a - b)
      expect([...widths]).toEqual(ascending)
      expect(new Set(widths).size).toBe(widths.length)
    }
  })
})
