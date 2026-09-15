import { closedDimensions, refinementDirective, renderRequest } from '@revy/core'
import { DISCOVERY_MAX_OPTIONS, DISCOVERY_MAX_QUESTIONS } from '@revy/shared/constants'
import { discoveryAskSchema } from '@revy/shared/schemas'
import { describe, expect, it } from 'vitest'

/**
 * Described-request discovery, as a conversation (SPEC 40, 43).
 *
 * The turn budget is the thing worth guarding. A model asked to police its own
 * question count will keep asking -- each question looks reasonable from inside
 * the conversation -- so the limit lives in the service and the schema, and
 * these assert that it cannot be talked around from the client.
 */

describe('discoveryAskSchema', () => {
  it('accepts a first turn with no transcript', () => {
    const parsed = discoveryAskSchema.parse({ request: 'a World War II film' })
    expect(parsed.answers).toEqual([])
    expect(parsed.decideNow).toBe(false)
  })

  it('carries a transcript through', () => {
    const parsed = discoveryAskSchema.parse({
      request: 'a World War II film',
      answers: [{ question: 'How heavy?', answer: 'Very' }],
    })
    expect(parsed.answers).toHaveLength(1)
    expect(parsed.answers[0]).toMatchObject({ question: 'How heavy?', answer: 'Very' })
    // Defaulted, so an older client that does not send it still parses.
    expect(parsed.answers[0]?.skipped).toBe(false)
  })

  it('refuses a transcript longer than the question budget', () => {
    // The ceiling on paid model calls per conversation. Without it a client
    // could post a hundred turns and each one is a call we pay for.
    const answers = Array.from({ length: DISCOVERY_MAX_QUESTIONS + 1 }, (_, i) => ({
      question: `Q${i}`,
      answer: 'yes',
    }))
    expect(() => discoveryAskSchema.parse({ request: 'anything', answers })).toThrow()
  })

  it('accepts a transcript exactly at the budget', () => {
    const answers = Array.from({ length: DISCOVERY_MAX_QUESTIONS }, (_, i) => ({
      question: `Q${i}`,
      answer: 'yes',
    }))
    expect(discoveryAskSchema.parse({ request: 'anything', answers }).answers).toHaveLength(
      DISCOVERY_MAX_QUESTIONS,
    )
  })

  it('rejects an empty answer', () => {
    // "" would reach the model as a question answered with nothing, which
    // reads as the reader having said something they did not.
    expect(() =>
      discoveryAskSchema.parse({
        request: 'anything',
        answers: [{ question: 'How heavy?', answer: '   ' }],
      }),
    ).toThrow()
  })

  it('bounds the length of a client-supplied question', () => {
    // The transcript is client-supplied, so its size is an input to a paid
    // call and has to be capped like any other.
    expect(() =>
      discoveryAskSchema.parse({
        request: 'anything',
        answers: [{ question: 'x'.repeat(201), answer: 'yes' }],
      }),
    ).toThrow()
  })

  it('still enforces the request length', () => {
    expect(() => discoveryAskSchema.parse({ request: 'x'.repeat(301) })).toThrow()
    expect(() => discoveryAskSchema.parse({ request: 'no' })).toThrow()
  })

  it('accepts the escape hatch', () => {
    expect(discoveryAskSchema.parse({ request: 'anything', decideNow: true }).decideNow).toBe(true)
  })
})

describe('a settled axis is not asked about twice', () => {
  it('records the axis a question covered', () => {
    const parsed = discoveryAskSchema.parse({
      request: 'a war film',
      answers: [{ question: 'What tone?', answer: 'Gritty', dimension: 'tone' }],
    })
    expect(parsed.answers[0]?.dimension).toBe('tone')
  })

  it('marks a declined question as skipped', () => {
    const parsed = discoveryAskSchema.parse({
      request: 'a war film',
      answers: [{ question: 'What tone?', answer: "Doesn't matter", skipped: true }],
    })
    expect(parsed.answers[0]?.skipped).toBe(true)
  })

  it('lists every settled axis once', () => {
    expect(
      closedDimensions([
        { question: 'a', answer: 'x', dimension: 'tone' },
        { question: 'b', answer: 'y', dimension: 'Tone' },
        { question: 'c', answer: 'z', dimension: 'length' },
      ]),
    ).toEqual(['tone', 'length'])
  })

  it('ignores an exchange with no axis recorded', () => {
    expect(closedDimensions([{ question: 'a', answer: 'x' }])).toEqual([])
  })

  it('names the closed axes in the directive, as data rather than a rule', () => {
    // A general "do not repeat yourself" instruction did not hold against a
    // real model; a concrete list of forbidden values is checkable.
    const directive = refinementDirective(true, ['tone', 'length'])
    expect(directive).toContain('tone')
    expect(directive).toContain('length')
  })

  it('says nothing about axes when none are settled', () => {
    expect(refinementDirective(true, [])).not.toContain('settled')
  })
})

describe('renderRequest', () => {
  it('sends the sentence alone on the first turn', () => {
    expect(renderRequest('a World War II film', [])).toBe('a World War II film')
  })

  it('appends what was asked and answered', () => {
    const rendered = renderRequest('a World War II film', [
      { question: 'How heavy do you want it?', answer: 'Very' },
    ])

    expect(rendered).toContain('a World War II film')
    expect(rendered).toContain('How heavy do you want it?')
    expect(rendered).toContain('Very')
  })

  it('keeps the exchanges in order', () => {
    const rendered = renderRequest('something', [
      { question: 'First?', answer: 'A' },
      { question: 'Second?', answer: 'B' },
    ])
    expect(rendered.indexOf('First?')).toBeLessThan(rendered.indexOf('Second?'))
  })

  it('marks a declined question in the transcript', () => {
    // The localised words for "doesn't matter" are not something the model can
    // reliably read as a refusal, least of all in Portuguese.
    const rendered = renderRequest('x', [
      { question: 'Q', answer: 'Tanto faz', skipped: true },
    ])
    expect(rendered).toMatch(/declined/i)
  })

  it('marks which side said what', () => {
    // Without the labels the model cannot tell its own question from the
    // reader's answer, and starts treating both as requests.
    const rendered = renderRequest('x', [{ question: 'Q', answer: 'A' }])
    expect(rendered).toMatch(/You asked/)
    expect(rendered).toMatch(/They answered/)
  })
})

describe('refinementDirective', () => {
  it('offers a question when there is budget', () => {
    expect(refinementDirective(true)).toMatch(/may ask/i)
  })

  it('demands an answer when there is not', () => {
    const directive = refinementDirective(false)
    expect(directive).toMatch(/no questions left/i)
    expect(directive).toMatch(/answer now/i)
  })

  it('says something different in each case', () => {
    // If these ever collapse to the same string the budget stops reaching the
    // model at all, and nothing else in the system would notice.
    expect(refinementDirective(true)).not.toBe(refinementDirective(false))
  })
})

describe('the conversation is bounded', () => {
  it('asks few enough questions to stay a conversation', () => {
    // Three narrows a vague request well. A fourth reads as an interrogation,
    // and each one is a paid call and ten more seconds of somebody's evening.
    expect(DISCOVERY_MAX_QUESTIONS).toBeGreaterThanOrEqual(1)
    expect(DISCOVERY_MAX_QUESTIONS).toBeLessThanOrEqual(4)
  })

  it('offers few enough options to fit a row of chips', () => {
    expect(DISCOVERY_MAX_OPTIONS).toBeLessThanOrEqual(6)
  })
})
