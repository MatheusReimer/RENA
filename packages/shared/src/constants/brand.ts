/**
 * Single source of truth for product identity.
 *
 * The working repo name is "Revy"; the design mockups brand it "VYBE".
 * Changing the user-facing brand should only ever require editing this file.
 */
export const BRAND = {
  /** Internal/package name. Used for storage keys, app ids, log prefixes. */
  slug: 'revy',
  /** User-facing product name shown in the UI. */
  name: 'VYBE',
  /** Wordmark tagline from the design. */
  tagline: 'Watch. Read. Share. Repeat.',
  /** Longer positioning line used in headers and meta description. */
  description: 'A social home for every story.',
  /** Reverse-DNS id used by Capacitor for the iOS/Android bundle. */
  appId: 'net.thinklogic.revy',
} as const
