import { isDomainError } from '@revy/shared/utils'
import type { DiscoveryRequest, Recommender, RecommenderAnswer } from './index'

/**
 * Several providers, tried in order (SPEC 40).
 *
 * The problem this solves is availability, not quality. A free tier does not
 * usually refuse a request outright -- it takes longer than anyone will wait,
 * or returns a 503 because everybody else is asking at the same moment. With
 * one provider that is a dead end and the reader gets an apology. With three,
 * the second one answers.
 *
 * Deliberately a chain rather than a random split. A split would be the shape
 * for an experiment comparing providers, and that is a different job needing a
 * success metric and enough traffic to reach significance -- neither of which
 * exists yet. Ordering by preference gives the reader the best available answer
 * every time, which is what a chain is for and what a split is not.
 *
 * Nothing here knows which providers it holds. Adding a fourth is one more
 * entry in the array upstream.
 */

export function createRecommenderChain(links: readonly Recommender[]): Recommender {
  const usable = links.filter((link) => link.available)

  if (usable.length === 0) {
    return {
      available: false,
      kind: 'none',
      async discover() {
        throw new Error('No AI provider is configured.')
      },
    }
  }

  if (usable.length === 1) return usable[0]!

  return {
    available: true,
    kind: usable.map((link) => link.kind).join('>'),

    async discover(input: DiscoveryRequest): Promise<RecommenderAnswer> {
      let lastError: unknown

      for (const [index, link] of usable.entries()) {
        try {
          const answer = await link.discover(input)
          // Worth a line only when it was not the first choice: knowing the
          // primary is being routed around is the difference between "it is a
          // bit slow today" and a provider that has been down for a week.
          if (index > 0) console.warn(`[revy] answered by ${link.kind} after ${index} failed`)
          return answer
        } catch (error) {
          lastError = error

          /*
           * Only an unavailable provider is worth routing around.
           *
           * PROVIDER_UNAVAILABLE means busy, slow or unreachable -- conditions
           * another provider genuinely does not share. Anything else is ours:
           * a rejected key, a malformed request, an answer that failed to
           * parse. Retrying those elsewhere would turn a misconfiguration into
           * a silent performance problem, and the second provider would be
           * carrying a bug nobody knows about.
           */
          if (!isDomainError(error) || error.code !== 'PROVIDER_UNAVAILABLE') throw error

          const next = usable[index + 1]
          if (next) console.warn(`[revy] ${link.kind} unavailable; trying ${next.kind}`)
        }
      }

      // Everything was unavailable. The last failure is the most recent and
      // carries a message already written for a reader.
      throw lastError
    },
  }
}
