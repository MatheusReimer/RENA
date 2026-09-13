import type { Database } from '@revy/db'
import { errors } from '@revy/shared/utils'
import type { ProviderRegistry } from './providers'

/**
 * Everything a service needs, passed in rather than imported (SPEC 5, 49.9).
 *
 * Services take a context instead of reaching for a module-level singleton.
 * That is what makes them testable against a transaction that rolls back, and
 * what keeps `packages/core` free of any Nuxt or Nitro import -- the condition
 * for lifting the backend out into its own service later without a rewrite.
 */
export interface ServiceContext {
  db: Database
  providers: ProviderRegistry
  /**
   * The authenticated user's domain id, or null when signed out.
   *
   * Services must never assume this is set: `requireViewer` is the only way to
   * assert it, so an authorization check can never be silently skipped.
   */
  viewerId: string | null
}

/**
 * A context guaranteed to have a viewer. Services that mutate take this type,
 * so "is the caller signed in" is answered by the type system rather than by
 * remembering to check (SPEC 25, 27).
 */
export interface AuthenticatedContext extends ServiceContext {
  viewerId: string
}

/** Narrows a context, throwing UNAUTHENTICATED when there is no viewer. */
export function requireViewer(ctx: ServiceContext): AuthenticatedContext {
  if (!ctx.viewerId) throw errors.unauthenticated()
  return ctx as AuthenticatedContext
}
