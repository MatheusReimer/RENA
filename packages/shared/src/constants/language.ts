/**
 * The languages content can be written in (SPEC 31).
 *
 * Deliberately the same list the interface is translated into, and kept here
 * rather than in the Nuxt config so the server can validate against it -- the
 * API must never store a language tag the product cannot then offer to filter
 * by, or a review becomes invisible to everyone including its author.
 *
 * Tags are BCP-47 and short. Regional variants only where they are genuinely
 * different to a reader: 'pt-BR' rather than 'pt', because a Brazilian reader
 * being shown European Portuguese is a worse answer than being shown nothing.
 */
export const CONTENT_LANGUAGES = ['en', 'pt-BR', 'es'] as const

export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: ContentLanguage = 'en'

/** Endonyms: a language is always named in itself, never translated. */
export const LANGUAGE_NAMES: Record<ContentLanguage, string> = {
  en: 'English',
  'pt-BR': 'Portugues',
  es: 'Espanol',
}

/**
 * Narrows anything to a supported language, falling back rather than throwing.
 *
 * Browsers send tags this product does not serve ('pt-PT', 'en-GB', 'fr'), and
 * the useful behaviour is to pick the nearest thing we have: match the whole
 * tag, then the base language, then give up. A 400 because somebody's phone is
 * set to Canadian French would be the wrong outcome.
 */
export function toContentLanguage(value: unknown): ContentLanguage {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE

  const exact = CONTENT_LANGUAGES.find((tag) => tag.toLowerCase() === value.toLowerCase())
  if (exact) return exact

  const base = value.split('-')[0]?.toLowerCase()
  const near = CONTENT_LANGUAGES.find((tag) => tag.split('-')[0]!.toLowerCase() === base)
  return near ?? DEFAULT_LANGUAGE
}
