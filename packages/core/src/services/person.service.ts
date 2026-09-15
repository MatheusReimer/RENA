import { CREDIT_ROLE_ORDER } from '@revy/shared/constants'
import type {
  CreditRole,
  MediaCredit,
  PersonCredit,
  PersonDetail,
  PersonSummary,
} from '@revy/shared/types'
import { errors } from '@revy/shared/utils'
import type { ServiceContext } from '../context'
import { toMedia } from '../mappers'
import { peopleRepository } from '../repositories'

/**
 * People in the catalogue: directors, actors, writers, authors, studios.
 *
 * A facet, not a community (SPEC 14). A title community works because everyone
 * in it consumed the same object and can argue about the same ending; a
 * director has no such object, and a room about one decays into "who is your
 * favourite" while pulling the conversation away from the titles where it
 * belongs. So a person gets a way *through* the catalogue, and the discussions
 * stay on the media pages.
 */

/**
 * How much of a filmography to return.
 *
 * Generous, because the whole point of the page is the body of work and a
 * prolific director has sixty credits -- but bounded, because the busiest
 * people in a catalogue this size are studios, and "Warner Bros." would
 * otherwise return everything they have ever shipped in one payload.
 */
const CREDIT_LIMIT = 120

/** How many faces a media page shows before it stops being a page about a film. */
const MEDIA_CREDIT_LIMIT = 20

export const personService = {
  async get(ctx: ServiceContext, personId: string): Promise<PersonDetail> {
    const person = await peopleRepository.findById(ctx.db, personId)
    if (!person) throw errors.notFound('NOT_FOUND', 'Person not found.')

    const [rows, creditCount] = await Promise.all([
      peopleRepository.creditsForPerson(ctx.db, personId, CREDIT_LIMIT),
      peopleRepository.creditCount(ctx.db, personId),
    ])

    /*
     * One entry per title, under the role that defines it.
     *
     * A writer-director has two credit rows on every film he makes, and
     * returning both put Oppenheimer, Tenet and Dunkirk on the page twice
     * each -- a filmography that looks like a bug. The page is "what has this
     * person made", and the answer is a list of things, not of contracts.
     *
     * The surviving role is the most defining one, so Nolan reads as the
     * director of Oppenheimer rather than its writer.
     */
    const byMedia = new Map<string, PersonCredit>()

    for (const row of rows) {
      const existing = byMedia.get(row.media.id)
      if (existing && rank(existing.role) <= rank(row.role)) continue

      byMedia.set(row.media.id, {
        media: toMedia(row.media),
        role: row.role,
        character: row.character,
        // Postgres returns numerics as strings over the wire; the average is
        // computed rather than stored, so it arrives as one.
        ratingAverage: row.ratingAverage === null ? null : Number(row.ratingAverage),
        ratingCount: row.ratingCount,
      })
    }

    const credits = [...byMedia.values()]

    return {
      id: person.id,
      name: person.name,
      imageUrl: person.imageUrl,
      metadata: person.metadata,
      credits,
      // Built from every row, not from the deduplicated list: somebody who
      // acts only in films they also direct is still an actor, and the
      // dedup above is exactly what would hide that.
      roles: orderRoles(rows.map((row) => row.role)),
      creditCount,
    }
  },

  /** The cast and crew strip on a media page. */
  async creditsForMedia(ctx: ServiceContext, mediaId: string): Promise<MediaCredit[]> {
    const rows = await peopleRepository.creditsForMedia(ctx.db, mediaId, MEDIA_CREDIT_LIMIT)

    return rows.map((row) => ({
      person: toPersonSummary(row.person),
      role: row.role,
      character: row.character,
    }))
  },

  /** Name search, for finding a person directly. */
  async search(ctx: ServiceContext, term: string, limit = 10): Promise<PersonSummary[]> {
    const trimmed = term.trim()
    if (trimmed.length < 2) return []

    const rows = await peopleRepository.searchByName(ctx.db, trimmed, limit)
    return rows.map((row) => toPersonSummary(row.person))
  },
}

function toPersonSummary(row: { id: string; name: string; imageUrl: string | null }): PersonSummary {
  return { id: row.id, name: row.name, imageUrl: row.imageUrl }
}

/** Position in `CREDIT_ROLE_ORDER`; lower is more defining. */
function rank(role: CreditRole): number {
  const at = CREDIT_ROLE_ORDER.indexOf(role)
  return at === -1 ? CREDIT_ROLE_ORDER.length : at
}

/**
 * Distinct roles, most defining first.
 *
 * Somebody who both directed and acted in a film is a director here, because
 * that is how the title is remembered -- and because a page headed "Actor"
 * for Clint Eastwood would be technically true and useless.
 */
function orderRoles(roles: CreditRole[]): CreditRole[] {
  const present = new Set(roles)
  return CREDIT_ROLE_ORDER.filter((role) => present.has(role))
}
