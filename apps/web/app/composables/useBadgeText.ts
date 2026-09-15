import { BADGE_DEFINITIONS } from '@revy/shared/constants'
import type { Badge } from '@revy/shared/types'

/**
 * Badge names and descriptions, in the reader's language (SPEC 17, 31).
 *
 * Badges are our own strings rather than catalogue text, so they are ordinary
 * i18n keys -- `badges.<slug>.name` -- and never go near the translation
 * service that handles reviews. The database keeps English and that is the
 * fallback, which matters for the case a locale file has not caught up with a
 * newly added badge: the reader sees the English name rather than a raw key.
 *
 * Everything here works from a slug alone, because that is all a `UserSummary`
 * carries. Resolving "what is this badge called" from a slug is a local lookup
 * against the shared definitions -- no request, no join.
 */
export function useBadgeText() {
  const { t, te } = useI18n()

  /** English fallbacks, by slug. Built once; the catalogue is a constant. */
  const english = new Map(BADGE_DEFINITIONS.map((badge) => [badge.slug, badge]))

  function name(slug: string | null | undefined): string | null {
    if (!slug) return null
    const key = `badges.${slug}.name`
    if (te(key)) return t(key)
    // Unknown slug: a badge the client's constants do not know about yet.
    // Returning null is better than the slug, which is not a name.
    return english.get(slug)?.name ?? null
  }

  function description(slug: string | null | undefined): string | null {
    if (!slug) return null
    const key = `badges.${slug}.description`
    if (te(key)) return t(key)
    return english.get(slug)?.description ?? null
  }

  /** Both, for a badge object that already carries its own English copy. */
  function textFor(badge: Badge): { name: string; description: string } {
    return {
      name: name(badge.slug) ?? badge.name,
      description: description(badge.slug) ?? badge.description,
    }
  }

  return { name, description, textFor }
}
