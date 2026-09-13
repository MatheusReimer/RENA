import { createProviderRegistry, userRepository, type ServiceContext } from '@revy/core'
import { errors } from '@revy/shared/utils'
import type { H3Event } from 'h3'
import { getAuthSession } from './auth'
import { useDatabase } from './db'

/**
 * Builds the `ServiceContext` for a request (SPEC 5).
 *
 * This is the only bridge between HTTP and the domain. Handlers get a context
 * and call services; nothing in `packages/core` ever sees an H3 event, which
 * is what keeps the backend liftable into its own process later.
 */

let registry: ReturnType<typeof createProviderRegistry> | null = null

function useProviders() {
  if (!registry) {
    const config = useRuntimeConfig()
    registry = createProviderRegistry({
      // Optional: without a TMDB key the app still runs and book search works.
      tmdbApiKey: config.tmdbApiKey || undefined,
    })
  }
  return registry
}

/**
 * Resolves the domain user for the request's session.
 *
 * Cached on the event because a single request can build a context more than
 * once (middleware plus handler), and this would otherwise be an extra query
 * each time.
 */
async function resolveViewerId(event: H3Event): Promise<string | null> {
  if (event.context.viewerId !== undefined) {
    return event.context.viewerId as string | null
  }

  const session = await getAuthSession(event)
  if (!session?.user?.id) {
    event.context.viewerId = null
    return null
  }

  const user = await userRepository.findByAuthUserId(useDatabase(), session.user.id)
  const viewerId = user?.id ?? null
  event.context.viewerId = viewerId
  return viewerId
}

/** Context for a route that works signed in or signed out. */
export async function useServiceContext(event: H3Event): Promise<ServiceContext> {
  return {
    db: useDatabase(),
    providers: useProviders(),
    viewerId: await resolveViewerId(event),
  }
}

/**
 * Context for a route that requires authentication (SPEC 27).
 *
 * Throws before the handler body runs, so a protected endpoint cannot forget
 * the check -- it either asks for this context or it is not protected.
 */
export async function useAuthenticatedContext(event: H3Event): Promise<ServiceContext> {
  const ctx = await useServiceContext(event)
  if (!ctx.viewerId) throw errors.unauthenticated()
  return ctx
}
