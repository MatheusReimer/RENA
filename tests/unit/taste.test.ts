import { genresFor, renderRequest } from '@revy/core'
import { MOODS } from '@revy/shared/constants'
import { tasteSchema } from '@revy/shared/schemas'
import { describe, expect, it } from 'vitest'

/**
 * Onboarding taste (SPEC 21).
 *
 * Two things are worth asserting here and they are both about restraint.
 *
 * The taste has to reach the prompt, because a stored profile nothing reads is
 * just a table. And it has to reach it as *background*: a reader who told us
 * they like horror at signup still gets to ask for a comedy today, and a
 * profile that silently overrode the sentence they just typed would be the
 * most annoying thing this feature could do.
 */

describe('renderRequest with taste', () => {
  it('omits the profile entirely when there is none', () => {
    expect(renderRequest('a heist film', [])).toBe('a heist film')
  })

  it('omits it when the reader picked nothing', () => {
    const rendered = renderRequest('a heist film', [], { moods: [], mediaTypes: [] })
    expect(rendered).toBe('a heist film')
  })

  it('appends the profile after the request, never before it', () => {
    const rendered = renderRequest('a heist film', [], {
      moods: ['Something that stays with you'],
      mediaTypes: ['movie'],
    })

    expect(rendered.startsWith('a heist film')).toBe(true)
    expect(rendered).toContain('Something that stays with you')
    expect(rendered).toContain('movie')
  })

  it('marks the profile as losing to the request', () => {
    const rendered = renderRequest('something funny', [], {
      moods: ['A good cry'],
      mediaTypes: [],
    })

    // The exact wording may change; that the model is told which one wins
    // must not.
    expect(rendered).toMatch(/request above wins/i)
  })

  it('keeps the transcript when both are present', () => {
    const rendered = renderRequest(
      'a heist film',
      [{ question: 'Modern or classic?', answer: 'Modern', skipped: false, dimension: 'era' }],
      { moods: ['Something weird'], mediaTypes: ['movie'] },
    )

    expect(rendered).toContain('So far:')
    expect(rendered).toContain('Modern')
    expect(rendered).toContain('Something weird')
    // Order matters: request, then transcript, then background.
    expect(rendered.indexOf('So far:')).toBeLessThan(rendered.indexOf('Something weird'))
  })
})

describe('genresFor', () => {
  it('returns nothing for no moods, which means no filter', () => {
    expect(genresFor([])).toEqual([])
  })

  it('unpacks a mood into the genre names the providers actually use', () => {
    const mood = MOODS[0]!
    expect(genresFor([mood.key])).toEqual(expect.arrayContaining([...mood.genres]))
  })

  it('de-duplicates genres shared by two moods', () => {
    const genres = genresFor(MOODS.map((mood) => mood.key))
    expect(new Set(genres).size).toBe(genres.length)
  })

  it('ignores a key that is not a mood', () => {
    expect(genresFor(['not-a-mood'])).toEqual([])
  })
})

describe('tasteSchema', () => {
  it('defaults every field, so an empty body is a valid skip', () => {
    const parsed = tasteSchema.parse({})
    expect(parsed).toEqual({ mediaTypes: [], moodKeys: [], skipped: false })
  })

  it('rejects a media type that does not exist', () => {
    expect(() => tasteSchema.parse({ mediaTypes: ['podcast'] })).toThrow()
  })

  it('caps the mood list, because it arrives from a form', () => {
    const tooMany = Array.from({ length: 40 }, (_, i) => `mood-${i}`)
    expect(() => tasteSchema.parse({ moodKeys: tooMany })).toThrow()
  })
})
