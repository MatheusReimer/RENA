import {
  type AuthenticatedContext,
  createMessageCipher,
  createProviderRegistry,
  type MessageCipher,
  requireViewer,
  type ServiceContext,
  userRepository,
} from '@revy/core'
import type { H3Event } from 'h3'
import { getAuthSession } from './auth'
import { useDatabase } from './db'
import { requestLocale } from './handler'

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
      // Both keys are optional. Without them the app still runs and book
      // search works; the corresponding media types simply return no results.
      tmdbApiKey: config.tmdbApiKey || undefined,
      rawgApiKey: config.rawgApiKey || undefined,
      igdbClientId: config.igdbClientId || undefined,
      igdbClientSecret: config.igdbClientSecret || undefined,
    })
  }
  return registry
}

/**
 * The message cipher, built once per process (SPEC 12, 39).
 *
 * Cached like the provider registry, and for a stronger reason: this parses
 * and validates key material, and doing that per request would put the keys
 * through an allocation on every message anyone sends.
 *
 * `undefined` means "not yet built" and `null` means "built, and there is no
 * key" -- a distinction worth keeping, because without it an unconfigured
 * deployment would re-derive nothing on every single request.
 */
let cipher: MessageCipher | null | undefined

function useMessageCipher(): MessageCipher | null {
  if (cipher === undefined) {
    const config = useRuntimeConfig()
    cipher = createMessageCipher({
      keyring: config.messageEncryptionKey || undefined,
      /*
       * Development only: `createMessageCipher` throws before reaching this
       * when NODE_ENV is production, so the session secret can never stand in
       * for a real key on a deployed environment.
       */
      fallbackSeed: config.authSecret || undefined,
      isProduction: process.env.NODE_ENV === 'production',
    })
  }
  return cipher
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
    messageCipher: useMessageCipher(),
    // Read from the same place `defineApiHandler` reads it, so a provider
    // call and the row-swapping boundary can never disagree about which
    // language a request is in.
    locale: requestLocale(event),
  }
}

/**
 * Context for a route that requires authentication (SPEC 27).
 *
 * Throws before the handler body runs, so a protected endpoint cannot forget
 * the check -- it either asks for this context or it is not protected.
 */
export async function useAuthenticatedContext(event: H3Event): Promise<AuthenticatedContext> {
  const ctx = await useServiceContext(event)
  return requireViewer(ctx)
}
