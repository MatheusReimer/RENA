import { MEDIA_TYPES } from '@revy/shared/constants'
import type { Executor } from '@revy/db'
import { mediaTranslationRepository } from '../repositories'

/**
 * Swaps catalogue text into the reader's language, on the way out.
 *
 * ## Why this is not a join
 *
 * There are two dozen queries that return catalogue rows and ten services that
 * map them, and `toMedia` is called from all of them. Threading a locale
 * through every one would work, and would also mean that the first query added
 * without it renders English titles on a Portuguese screen with nothing
 * failing -- a silent, per-screen regression, which is the worst failure shape
 * a feature like this has.
 *
 * So it happens once, at the API boundary, over the finished payload. One
 * insertion point that cannot drift, one extra indexed query per request, and
 * a no-op for English readers -- which is most of them, and which costs
 * nothing because it returns before walking anything.
 *
 * ## How a media object is recognised
 *
 * By shape, and deliberately narrowly. Two forms appear in payloads:
 *
 *   `{ id, mediaType, title }`             -- a `Media`, and anything built on it
 *   `{ mediaId, mediaType, mediaTitle }`   -- flattened onto a review or feed card
 *
 * Both require `mediaType` to be one of the four the domain knows, which is a
 * strong enough marker that nothing else in any payload collides with it.
 * Anything that does not match is left exactly as it was.
 */

const MEDIA_TYPE_SET = new Set<string>(MEDIA_TYPES)

/** How deep to walk before assuming a cycle. Payloads here nest ~6 deep. */
const MAX_DEPTH = 12

interface Nested {
  /** Where the id is, and which fields the translation replaces. */
  id: string
  titleKey: 'title' | 'mediaTitle'
  hasDescription: boolean
  target: Record<string, unknown>
}

export async function localiseMedia<T>(db: Executor, language: string, payload: T): Promise<T> {
  // English is the stored text. Nothing to look up, nothing to walk.
  if (!language || language === 'en') return payload
  if (payload === null || typeof payload !== 'object') return payload

  const found: Nested[] = []
  collect(payload, found, 0, new Set())
  if (found.length === 0) return payload

  const translations = await mediaTranslationRepository.forMedia(
    db,
    language,
    [...new Set(found.map((entry) => entry.id))],
  )
  if (translations.size === 0) return payload

  for (const entry of found) {
    const text = translations.get(entry.id)
    if (!text) continue

    // A title is only replaced when there is one: plenty of films keep their
    // original name abroad, and TMDB stores that as an absent translation
    // rather than as a copy. Falling through to the stored title is correct.
    if (text.title) entry.target[entry.titleKey] = text.title
    if (text.description && entry.hasDescription) entry.target.description = text.description
  }

  return payload
}

function collect(node: unknown, into: Nested[], depth: number, seen: Set<object>): void {
  if (depth > MAX_DEPTH || node === null || typeof node !== 'object') return

  // Payloads are trees, but a cycle here would hang the request rather than
  // fail it, which is the one outcome worth spending a Set to prevent.
  if (seen.has(node)) return
  seen.add(node)

  if (Array.isArray(node)) {
    for (const item of node) collect(item, into, depth + 1, seen)
    return
  }

  const record = node as Record<string, unknown>

  if (typeof record.mediaType === 'string' && MEDIA_TYPE_SET.has(record.mediaType)) {
    if (typeof record.id === 'string' && typeof record.title === 'string') {
      into.push({
        id: record.id,
        titleKey: 'title',
        hasDescription: 'description' in record,
        target: record,
      })
    } else if (typeof record.mediaId === 'string' && typeof record.mediaTitle === 'string') {
      into.push({
        id: record.mediaId,
        titleKey: 'mediaTitle',
        hasDescription: false,
        target: record,
      })
    }
  }

  for (const value of Object.values(record)) collect(value, into, depth + 1, seen)
}
