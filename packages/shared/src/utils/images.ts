/**
 * Sizing artwork URLs at the point of use.
 *
 * Providers hand back one URL at one size. We store the largest the provider
 * has, because that is the only size we cannot reconstruct later -- and then
 * ask for a smaller one here, per screen, so a rail of two hundred cards is
 * not two hundred full-resolution posters.
 *
 * TMDB is the only provider whose URLs carry the size in the path, so it is
 * the only one that can be resized this way. Everything else passes through
 * untouched rather than being mangled into a 404.
 */

/**
 * Widths TMDB actually serves.
 *
 * A union rather than a number, so a typo like `w600` -- which TMDB answers
 * with a 404, not a resized image -- is a compile error instead of a missing
 * poster nobody notices until it is in front of a user.
 */
export type TmdbWidth = 92 | 154 | 185 | 342 | 500 | 780 | 1280

/**
 * Matches the size segment of a TMDB image URL.
 *
 * Deliberately matches any current segment rather than only `original`, so a
 * row imported before we raised the stored size is still resized correctly
 * instead of being left at whatever it happens to hold.
 */
const TMDB_SIZE_SEGMENT = /(https:\/\/image\.tmdb\.org\/t\/p\/)(w\d+|original)(\/)/

export function isResizable(url: string | null | undefined): boolean {
  return typeof url === 'string' && TMDB_SIZE_SEGMENT.test(url)
}

/**
 * The same image at a given width, or `original` for the provider's best.
 *
 * Returns the input unchanged when the URL is not one we can resize, so
 * callers can apply it to any artwork without checking the provider first.
 */
export function imageAtWidth(
  url: string | null | undefined,
  width: TmdbWidth | 'original',
): string | null {
  if (!url) return null
  if (!TMDB_SIZE_SEGMENT.test(url)) return url

  const segment = width === 'original' ? 'original' : `w${width}`
  return url.replace(TMDB_SIZE_SEGMENT, `$1${segment}$3`)
}

/**
 * A `srcset` across the widths that bracket a displayed size.
 *
 * Returns null for artwork we cannot resize; the caller then falls back to a
 * plain `src`, which is the correct behaviour rather than a broken candidate
 * list. Descriptors are widths (`w`), so the browser can combine them with
 * `sizes` and the device pixel ratio -- which is the whole point, since the
 * same poster is 92px in a search result and 500px in a hero.
 */
export function imageSrcSet(
  url: string | null | undefined,
  widths: readonly TmdbWidth[],
): string | null {
  if (!url || !isResizable(url)) return null

  return widths
    .map((width) => `${imageAtWidth(url, width)} ${width}w`)
    .join(', ')
}

/** Widths a poster is displayed at across the app, smallest to largest. */
export const POSTER_WIDTHS = [154, 342, 500, 780] as const satisfies readonly TmdbWidth[]

/** Widths a backdrop is displayed at. Starts higher: it is never a thumbnail. */
export const BACKDROP_WIDTHS = [780, 1280] as const satisfies readonly TmdbWidth[]
