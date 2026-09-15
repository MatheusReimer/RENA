import { createTmdbProvider } from '@revy/core'
import { describe, expect, it } from 'vitest'

/**
 * TMDB credit mapping.
 *
 * Worth testing because the failure mode is silent. A provider mapping that
 * reads the wrong field returns `[]` and throws nothing -- which is exactly
 * how the IGDB `category`/`game_type` rename went unnoticed while its test
 * passed, asserting only the string we *sent*.
 *
 * So these assert the shape that comes *back* out: which credits survive the
 * allowlist, what they are called, and the two cases that would otherwise
 * produce a row Postgres rejects.
 */

function stub(payload: unknown, capture?: { url?: string }) {
  const impl = (async (input: string | URL) => {
    if (capture) capture.url = String(input)
    return {
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response
  }) as unknown as typeof fetch

  return createTmdbProvider({ apiKey: 'a'.repeat(32), fetchImpl: impl })
}

describe('tmdb credits', () => {
  it('keeps cast in billing order and carries the character', async () => {
    const provider = stub({
      cast: [
        { id: 2, name: 'Second Billed', order: 1, character: 'Rachel' },
        { id: 1, name: 'First Billed', order: 0, character: 'Bruce Wayne' },
      ],
    })

    const credits = await provider.getCredits!('155', 'movie')

    expect(credits.map((c) => c.name)).toEqual(['First Billed', 'Second Billed'])
    expect(credits[0]).toMatchObject({
      role: 'cast',
      character: 'Bruce Wayne',
      billing: 0,
      provider: 'tmdb',
      externalId: '1',
    })
  })

  it('caps the cast, because TMDB lists every extra', async () => {
    const provider = stub({
      cast: Array.from({ length: 40 }, (_, i) => ({
        id: i,
        name: `Person ${i}`,
        order: i,
        character: `Role ${i}`,
      })),
    })

    const credits = await provider.getCredits!('155', 'movie')

    expect(credits).toHaveLength(12)
    expect(credits.at(-1)?.name).toBe('Person 11')
  })

  it('maps only allowlisted crew jobs', async () => {
    const provider = stub({
      crew: [
        { id: 10, name: 'A Director', job: 'Director' },
        { id: 11, name: 'A Gaffer', job: 'Gaffer' },
        { id: 12, name: 'A Writer', job: 'Screenplay' },
        { id: 13, name: 'A Caterer', job: 'Craft Service' },
      ],
    })

    const credits = await provider.getCredits!('155', 'movie')

    expect(credits.map((c) => [c.name, c.role])).toEqual([
      ['A Director', 'director'],
      ['A Writer', 'writer'],
    ])
  })

  /*
   * The bug this exists to prevent.
   *
   * TMDB credits one person twice on the same film for "Story" and
   * "Screenplay", and both map to `writer` here. The unique index is on
   * (media, person, role), so emitting both makes the insert fail on a
   * perfectly ordinary film -- and it is not an edge case, it is most films
   * with one writer.
   */
  it('emits one credit per person and role', async () => {
    const provider = stub({
      crew: [
        { id: 20, name: 'Christopher Nolan', job: 'Director' },
        { id: 20, name: 'Christopher Nolan', job: 'Screenplay' },
        { id: 20, name: 'Christopher Nolan', job: 'Story' },
      ],
    })

    const credits = await provider.getCredits!('155', 'movie')

    expect(credits).toHaveLength(2)
    expect(credits.map((c) => c.role).sort()).toEqual(['director', 'writer'])
  })

  it('never puts a character on a crew credit', async () => {
    const provider = stub({
      crew: [{ id: 30, name: 'A Director', job: 'Director', character: 'leftover' }],
    })

    const credits = await provider.getCredits!('155', 'movie')

    expect(credits[0]?.character).toBeNull()
  })

  it('picks up a series creator, which TMDB keeps outside the crew list', async () => {
    const provider = stub({
      crew: [],
      created_by: [{ id: 40, name: 'Vince Gilligan' }],
    })

    const credits = await provider.getCredits!('1396', 'series')

    expect(credits).toEqual([expect.objectContaining({ name: 'Vince Gilligan', role: 'creator' })])
  })

  it('drops credits with no name rather than writing an empty person', async () => {
    const provider = stub({
      cast: [{ id: 50, order: 0, character: 'Ghost' }],
      crew: [{ id: 51, job: 'Director' }],
    })

    expect(await provider.getCredits!('155', 'movie')).toEqual([])
  })

  it('asks the tv endpoint for a series', async () => {
    const capture: { url?: string } = {}
    const provider = stub({ cast: [] }, capture)

    await provider.getCredits!('1396', 'series')

    // Confirms only what we send. The far end accepting it is what the
    // shape assertions above are for.
    expect(capture.url).toContain('/tv/1396/credits')
  })

  it('returns nothing for a type TMDB does not serve', async () => {
    const provider = stub({ cast: [{ id: 1, name: 'Nobody', order: 0 }] })

    expect(await provider.getCredits!('OL123W', 'book')).toEqual([])
  })
})
