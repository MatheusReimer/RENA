import {
  createOpenAICompatibleRecommender,
  createRecommenderChain,
  parseCompletion,
  type DiscoveryRequest,
  type Recommender,
  type RecommenderAnswer,
} from '@revy/core'
import { DomainError } from '@revy/shared/utils'
import { describe, expect, it, vi } from 'vitest'

/**
 * Several providers behind one interface (SPEC 40, 43).
 *
 * Two properties matter and neither is obvious from reading the chain:
 *
 *  - An *unavailable* provider is routed around. That is the whole point.
 *  - Anything else is not. A rejected key or an unparseable answer must
 *    surface, because retrying those on the next provider turns a
 *    misconfiguration into a silent performance problem that nobody
 *    investigates -- the feature still works, just slower and on the wrong
 *    model, forever.
 */

const REQUEST: DiscoveryRequest = {
  request: 'something quiet',
  candidates: [
    {
      ref: 1,
      mediaType: 'movie',
      title: 'Paterson',
      year: 2016,
      authors: [],
      genres: ['Drama'],
      ratingAverage: null,
      ratingCount: 0,
      externalRating: null,
    },
  ],
  locale: 'en',
  limit: 8,
  answers: [],
  canAskQuestion: false,
}

const ANSWER: RecommenderAnswer = {
  understood: 'something quiet',
  picks: [{ ref: 1, because: 'It is gentle.' }],
  nothingFits: null,
  question: null,
}

function working(kind: string, answer: RecommenderAnswer = ANSWER): Recommender {
  return { available: true, kind, discover: vi.fn(async () => answer) }
}

function failing(kind: string, error: unknown): Recommender {
  return {
    available: true,
    kind,
    discover: vi.fn(async () => {
      throw error
    }),
  }
}

const unavailable = (kind: string) =>
  failing(kind, new DomainError('PROVIDER_UNAVAILABLE', 'Busy right now.'))

describe('the provider chain', () => {
  it('uses the first provider when it answers', async () => {
    const first = working('gemini')
    const second = working('cerebras')

    const answer = await createRecommenderChain([first, second]).discover(REQUEST)

    expect(answer).toEqual(ANSWER)
    expect(second.discover).not.toHaveBeenCalled()
  })

  it('falls through when a provider is unavailable', async () => {
    const second = working('cerebras')
    const answer = await createRecommenderChain([unavailable('gemini'), second]).discover(REQUEST)

    expect(answer).toEqual(ANSWER)
    expect(second.discover).toHaveBeenCalledOnce()
  })

  it('keeps falling through across several providers', async () => {
    const last = working('groq')
    const answer = await createRecommenderChain([
      unavailable('gemini'),
      unavailable('cerebras'),
      last,
    ]).discover(REQUEST)

    expect(answer).toEqual(ANSWER)
    expect(last.discover).toHaveBeenCalledOnce()
  })

  it('reports the last failure when every provider is unavailable', async () => {
    await expect(
      createRecommenderChain([unavailable('gemini'), unavailable('cerebras')]).discover(REQUEST),
    ).rejects.toThrow(/busy/i)
  })

  it('does NOT route around a rejected key', async () => {
    // The failure that must not be hidden: retrying a misconfiguration on the
    // next provider leaves the feature quietly running on the wrong model.
    const second = working('cerebras')
    const chain = createRecommenderChain([
      failing('gemini', new DomainError('INTERNAL_ERROR', 'Unavailable right now.')),
      second,
    ])

    await expect(chain.discover(REQUEST)).rejects.toThrow()
    expect(second.discover).not.toHaveBeenCalled()
  })

  it('does NOT route around an unexpected throw', async () => {
    const second = working('cerebras')
    const chain = createRecommenderChain([failing('gemini', new TypeError('bug')), second])

    await expect(chain.discover(REQUEST)).rejects.toThrow(TypeError)
    expect(second.discover).not.toHaveBeenCalled()
  })

  it('ignores providers that are not configured', async () => {
    const configured = working('cerebras')
    const chain = createRecommenderChain([
      { available: false, kind: 'none', discover: vi.fn() },
      configured,
    ])

    expect(chain.kind).toBe('cerebras')
    await chain.discover(REQUEST)
    expect(configured.discover).toHaveBeenCalledOnce()
  })

  it('is unavailable when nothing is configured', () => {
    const chain = createRecommenderChain([{ available: false, kind: 'none', discover: vi.fn() }])
    expect(chain.available).toBe(false)
  })

  it('names every link, so the startup log says what is in play', () => {
    expect(createRecommenderChain([working('gemini'), working('groq')]).kind).toBe('gemini>groq')
  })
})

describe('the OpenAI-compatible transport', () => {
  /** Captures the request without a key or a network. */
  function stub(status: number, body: unknown) {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    return { calls, fetchImpl }
  }

  const completion = (content: unknown) => ({
    choices: [{ message: { content: JSON.stringify(content) } }],
  })

  function transport(fetchImpl: typeof fetch) {
    return createOpenAICompatibleRecommender({
      apiKey: 'k',
      baseUrl: 'https://example.test/v1',
      model: 'test-model',
      kind: 'test',
      fetchImpl,
    })
  }

  it('posts to the chat-completions endpoint', async () => {
    const { calls, fetchImpl } = stub(200, completion(ANSWER))
    await transport(fetchImpl).discover(REQUEST)

    expect(calls[0]?.url).toBe('https://example.test/v1/chat/completions')
    expect(calls[0]?.init.method).toBe('POST')
  })

  it('sends the catalogue as system and the reader as user', async () => {
    const { calls, fetchImpl } = stub(200, completion(ANSWER))
    await transport(fetchImpl).discover(REQUEST)

    const body = JSON.parse(String(calls[0]?.init.body))
    expect(body.messages[0].role).toBe('system')
    expect(body.messages[0].content).toContain('Paterson')
    // The boundary that matters: their sentence is described, never obeyed.
    expect(body.messages[1]).toEqual({ role: 'user', content: 'something quiet' })
  })

  it('asks for schema-constrained output', async () => {
    const { calls, fetchImpl } = stub(200, completion(ANSWER))
    await transport(fetchImpl).discover(REQUEST)

    const body = JSON.parse(String(calls[0]?.init.body))
    expect(body.response_format.type).toBe('json_schema')
    expect(body.response_format.json_schema.schema.properties).toHaveProperty('picks')
  })

  it('returns a grounded answer', async () => {
    const { fetchImpl } = stub(200, completion(ANSWER))
    expect(await transport(fetchImpl).discover(REQUEST)).toEqual(ANSWER)
  })

  it('reports a rate limit as unavailable, so the chain routes around it', async () => {
    const { fetchImpl } = stub(429, { error: 'slow down' })
    await expect(transport(fetchImpl).discover(REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
  })

  it('reports a server error as unavailable too', async () => {
    const { fetchImpl } = stub(503, { error: 'busy' })
    await expect(transport(fetchImpl).discover(REQUEST)).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    })
  })

  it('reports a rejected key as ours to fix, NOT as unavailable', async () => {
    // 401 must not fall through: another provider would answer and the broken
    // key would never be noticed.
    const { fetchImpl } = stub(401, { error: 'bad key' })
    await expect(transport(fetchImpl).discover(REQUEST)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    })
  })

  it('refuses an empty completion rather than reporting nothing found', async () => {
    const { fetchImpl } = stub(200, { choices: [{ message: { content: null } }] })
    await expect(transport(fetchImpl).discover(REQUEST)).rejects.toThrow()
  })

  it('refuses an envelope it cannot read', async () => {
    const { fetchImpl } = stub(200, { unexpected: true })
    await expect(transport(fetchImpl).discover(REQUEST)).rejects.toThrow()
  })
})

describe('parseCompletion', () => {
  it('reads a well-formed answer', () => {
    expect(parseCompletion('test', JSON.stringify(ANSWER))).toEqual(ANSWER)
  })

  it('refuses prose wrapped around the JSON', () => {
    expect(() => parseCompletion('test', 'Here you go: {"understood":"x"}')).toThrow()
  })

  it('refuses an answer missing a required field', () => {
    expect(() => parseCompletion('test', JSON.stringify({ understood: 'x' }))).toThrow()
  })
})
