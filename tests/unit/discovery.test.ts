import {
  groundPicks,
  renderCatalogue,
  toCandidate,
  usefulGenres,
  type DiscoveryCandidate,
} from '@revy/core'
import { RATE_LIMITS } from '@revy/shared/constants'
import { discoveryAskSchema } from '@revy/shared/schemas'
import { describe, expect, it } from 'vitest'

/**
 * Natural language discovery (SPEC 40).
 *
 * The feature asks a language model what to recommend, which means the test
 * that matters is not "does it give good answers" -- no unit test decides that
 * -- but "can a bad answer put something in front of a reader that is not in
 * our catalogue". It cannot, and these are the reasons why.
 *
 * The model never names a title. It is handed a numbered list and answers with
 * numbers, and every number is looked up before it becomes a result. So the
 * failure mode of a confused model is fewer results, never invented ones, and
 * that is the property under test here.
 */

/** A candidate row, with the shape the repository returns. */
function row(id: string, over: Partial<Parameters<typeof toCandidate>[1]> = {}) {
  return {
    id,
    mediaType: 'movie' as const,
    title: 'Fight Club',
    releaseDate: '1999-10-15',
    metadata: {},
    ratingCount: 0,
    ratingSum: 0,
    ...over,
  }
}

function refMap(...ids: string[]): Map<number, { id: string }> {
  return new Map(ids.map((id, index) => [index + 1, { id }]))
}

describe('a pick can only name something we have', () => {
  const catalogue = refMap('a', 'b', 'c')

  it('drops a number that is not in the catalogue', () => {
    const chosen = groundPicks(
      [
        { ref: 1, because: 'real' },
        { ref: 99, because: 'invented' },
        { ref: 3, because: 'also real' },
      ],
      catalogue,
      8,
    )

    expect(chosen.map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('drops every number when the model answers with nonsense', () => {
    const chosen = groundPicks(
      [
        { ref: 0, because: 'off by one' },
        { ref: -4, because: 'negative' },
        { ref: 1_000, because: 'past the end' },
      ],
      catalogue,
      8,
    )

    expect(chosen).toEqual([])
  })

  /*
   * Zero specifically, because it is the plausible mistake.
   *
   * The list is 1-based, and a model that counts from zero would otherwise
   * shift every recommendation by one title -- returning a full set of
   * confident, real, completely unrelated answers. Dropping is the right
   * failure: wrong-and-empty is visible, wrong-and-plausible is not.
   */
  it('treats zero as out of range rather than as the first title', () => {
    expect(groundPicks([{ ref: 0, because: '' }], catalogue, 8)).toEqual([])
  })
})

describe('the answer is a list of distinct titles, in the order given', () => {
  it('keeps the model ordering', () => {
    const chosen = groundPicks(
      [
        { ref: 3, because: 'best' },
        { ref: 1, because: 'second' },
        { ref: 2, because: 'third' },
      ],
      refMap('a', 'b', 'c'),
      8,
    )

    expect(chosen.map((entry) => entry.id)).toEqual(['c', 'a', 'b'])
  })

  it('keeps the first reason when a title is picked twice', () => {
    const chosen = groundPicks(
      [
        { ref: 1, because: 'first reason' },
        { ref: 1, because: 'second reason' },
      ],
      refMap('a', 'b'),
      8,
    )

    expect(chosen).toEqual([{ id: 'a', because: 'first reason' }])
  })

  it('applies the limit after dropping, so bad picks do not use up slots', () => {
    const chosen = groundPicks(
      [
        { ref: 50, because: 'invented' },
        { ref: 1, because: 'real' },
        { ref: 2, because: 'real' },
        { ref: 3, because: 'real' },
      ],
      refMap('a', 'b', 'c'),
      3,
    )

    expect(chosen).toHaveLength(3)
  })
})

describe('what the model is shown', () => {
  it('numbers candidates from one', () => {
    const candidate = toCandidate(1, row('a'))
    expect(candidate.ref).toBe(1)
    expect(candidate.year).toBe(1999)
  })

  /*
   * Open Library hands us shelving data rather than genres.
   *
   * A single novel arrives with dozens of subjects -- "New York Times
   * bestseller", a character's name, a catalogue key like
   * "nyt:young-adult-paperback-monthly=2022-09-04". Past the first few they
   * describe the cataloguing rather than the book, and every one of them is
   * paid for in tokens on every request.
   */
  it('keeps only the first few genres', () => {
    const candidate = toCandidate(
      1,
      row('a', {
        metadata: {
          genres: ['Fiction', 'Fantasy', 'Magic', 'Wizards', 'New York Times bestseller', 'Owls'],
        },
      }),
    )

    expect(candidate.genres).toHaveLength(4)
    expect(candidate.genres).not.toContain('New York Times bestseller')
  })

  /*
   * The machine-readable subjects are dropped before the truncation, not
   * after. Otherwise a book whose first four subjects are all catalogue keys
   * reaches the model described entirely by punctuation.
   */
  it('discards cataloguing keys and keeps the subjects that describe the book', () => {
    expect(
      usefulGenres([
        'nyt:combined-print-and-e-book-fiction=2023-07-02',
        'collectionID:Ydarkromance',
        'award:hugo_award=novel',
        'Fiction',
        'Romance',
      ]),
    ).toEqual(['Fiction', 'Romance'])
  })

  it('names the author, so "a Stephen King novel" has something to match', () => {
    const candidate = toCandidate(
      1,
      row('a', { mediaType: 'book', metadata: { authors: ['Stephen King'] } }),
    )

    expect(candidate.authors).toEqual(['Stephen King'])
  })

  it('keeps at most two authors out of an anthology', () => {
    const candidate = toCandidate(
      1,
      row('a', { metadata: { authors: ['A', 'B', 'C', 'D', 'E'] } }),
    )

    expect(candidate.authors).toHaveLength(2)
  })

  it('reads a missing release date as no year rather than as NaN', () => {
    expect(toCandidate(1, row('a', { releaseDate: null })).year).toBeNull()
  })

  it('prefers RENA ratings and falls back to the provider score', () => {
    const rated = toCandidate(1, row('a', { ratingCount: 4, ratingSum: 36 }))
    expect(rated.ratingAverage).toBe(4.5)

    const unrated = toCandidate(
      2,
      row('b', { metadata: { externalRating: { source: 'TMDB', score: 8.4, votes: 900 } } }),
    )
    expect(unrated.ratingAverage).toBeNull()
    expect(unrated.externalRating).toBe(8.4)
  })
})

describe('the catalogue listing', () => {
  const candidates: DiscoveryCandidate[] = [
    {
      ref: 1,
      mediaType: 'movie',
      title: 'Fight Club',
      year: 1999,
      authors: [],
      genres: ['Drama', 'Thriller'],
      ratingAverage: 4.5,
      ratingCount: 12,
      externalRating: 8.4,
    },
    {
      ref: 2,
      mediaType: 'game',
      title: 'Hollow Knight',
      year: null,
      authors: [],
      genres: [],
      ratingAverage: null,
      ratingCount: 0,
      externalRating: null,
    },
  ]

  const rendered = renderCatalogue(candidates)

  it('gives one line per title, each starting with its number', () => {
    const lines = rendered.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^1\. /)
    expect(lines[1]).toMatch(/^2\. /)
  })

  it('marks what kind of thing each one is', () => {
    expect(rendered).toContain('[movie] Fight Club')
    expect(rendered).toContain('[game] Hollow Knight')
  })

  /*
   * A title with nothing on it is still a line.
   *
   * Every game in the catalogue is in this state -- Steam gives us no genres,
   * no date and no score. Skipping the bare rows would quietly make this a
   * feature that cannot recommend a game, which is one of the three things it
   * was asked to do.
   */
  it('lists a title that carries no metadata at all', () => {
    expect(rendered).toContain('2. [game] Hollow Knight')
  })

  it("leads with RENA's rating when there is one, and the provider's otherwise", () => {
    expect(rendered).toContain('RENA 4.5/5 from 12')
    expect(rendered).not.toContain('8.4/10 elsewhere')
  })

  /*
   * Open Library subjects contain commas of their own -- "Fiction, romance,
   * new adult" is one subject. Joining them with commas produces a line where
   * nothing marks where one ends and the next begins.
   */
  it('separates genres with something that is not inside a genre', () => {
    const line = renderCatalogue([
      {
        ref: 1,
        mediaType: 'book',
        title: 'Twisted Love',
        year: 2021,
        authors: ['Ana Huang'],
        genres: ['Fiction, romance, new adult', 'Fiction, romance, contemporary'],
        ratingAverage: null,
        ratingCount: 0,
        externalRating: null,
      },
    ])

    expect(line).toContain('Fiction, romance, new adult · Fiction, romance, contemporary')
    expect(line).toContain('by Ana Huang')
  })
})

describe('what a request is allowed to be', () => {
  it('rejects an empty description', () => {
    expect(discoveryAskSchema.safeParse({ request: '   ' }).success).toBe(false)
  })

  /*
   * The ceiling is a cost control, not a style guide.
   *
   * Every character here is forwarded to a metered API. Three hundred is three
   * sentences -- past what describing a mood takes, well short of what a
   * pasted document costs.
   */
  it('rejects a pasted essay', () => {
    expect(discoveryAskSchema.safeParse({ request: 'a'.repeat(301) }).success).toBe(false)
    expect(discoveryAskSchema.safeParse({ request: 'a'.repeat(300) }).success).toBe(true)
  })

  it('accepts a sentence and defaults the language', () => {
    const parsed = discoveryAskSchema.safeParse({
      request: 'Something under two hours I can watch with my girlfriend',
    })

    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.language).toBeUndefined()
  })

  it('rejects a language we do not publish in', () => {
    expect(discoveryAskSchema.safeParse({ request: 'anything', language: 'fr' }).success).toBe(
      false,
    )
  })
})

describe('the rate limit reflects what a request costs us', () => {
  /*
   * This is the only endpoint where one request spends money rather than a
   * quota or a row, so it carries the strictest limit of anything that is not
   * a credential check. If a future edit loosens it past search or writes,
   * that is worth failing a build over.
   */
  it('is stricter than every other non-credential limit', () => {
    const perHour = (rule: { limit: number; windowSeconds: number }) =>
      (rule.limit / rule.windowSeconds) * 3600

    expect(perHour(RATE_LIMITS.discovery)).toBeLessThan(perHour(RATE_LIMITS.search))
    expect(perHour(RATE_LIMITS.discovery)).toBeLessThan(perHour(RATE_LIMITS.write))
    expect(perHour(RATE_LIMITS.discovery)).toBeLessThan(perHour(RATE_LIMITS.global))
  })

  it('counts in its own bucket, so it cannot share a budget with another rule', () => {
    const buckets = Object.values(RATE_LIMITS).map((rule) => rule.bucket)
    expect(new Set(buckets).size).toBe(buckets.length)
  })
})
