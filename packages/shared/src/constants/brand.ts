/**
 * Single source of truth for product identity.
 *
 * The repository and package scope are still "revy"; the product is "RENA".
 * Changing the user-facing brand should only ever require editing this file --
 * anything that hardcodes the name elsewhere is a bug.
 */
export const BRAND = {
  /** Internal/package name. Used for storage keys, app ids, log prefixes. */
  slug: 'revy',
  /** User-facing product name shown in the UI. */
  name: 'RENA',
  /** Wordmark tagline from the design. */
  tagline: 'Watch. Read. Share. Repeat.',
  /** Longer positioning line used in headers and meta description. */
  description: 'A social home for every story.',
  /** Reverse-DNS id used by Capacitor for the iOS/Android bundle. */
  appId: 'net.thinklogic.rena',

  /**
   * Store listings for the native apps.
   *
   * Null until each app is actually published, and the landing screen reads
   * these rather than assuming: with a URL it offers a phone visitor the app,
   * and without one it offers them the web sign-up exactly as it does on a
   * desktop. A "Download on the App Store" button that 404s is worse than no
   * button, and worse still because it is the first thing a phone visitor
   * would touch.
   */
  stores: {
    ios: null as string | null,
    android: null as string | null,
  },
} as const
