import type { Database } from '@revy/db'
import { errors } from '@revy/shared/utils'
import type { MessageCipher } from './crypto'
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
  /**
   * Seals and opens direct message bodies (SPEC 12, 39).
   *
   * Null when no encryption key is configured, which disables messaging rather
   * than downgrading it -- there is deliberately no path that stores a message
   * body without this. `requireMessageCipher` is the only way to reach it, for
   * the same reason `requireViewer` is the only way to reach `viewerId`.
   */
  messageCipher: MessageCipher | null
  /**
   * Everyone invisible to this viewer, in both directions.
   *
   * Blocking is mutual: somebody the viewer blocked and somebody who blocked
   * the viewer are equally absent, so one list covers both. Resolved once per
   * request and handed to the queries that list other people's writing --
   * feeds, reviews, comments, search, members, conversations.
   *
   * On the context rather than fetched per service, because a block that
   * applies on the feed and not in search is not a block. Empty for a
   * signed-out reader, who has blocked nobody and is invisible to nobody.
   */
  blockedUserIds: readonly string[]
  /**
   * The language this request wants its catalogue text in (SPEC 31).
   *
   * Already applied to stored rows by `localiseMedia` at the API boundary.
   * It is here for the case that boundary cannot reach: results fetched live
   * from a provider have no translation row to swap in, so the provider has to
   * be asked in the right language in the first place.
   */
  locale: string
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

/**
 * Returns the message cipher, or refuses the request.
 *
 * Messaging is unavailable rather than degraded when there is no key. Reading
 * a thread needs this as much as writing one does, so both call it -- a
 * deployment that lost its key shows an error, not an empty conversation that
 * looks like the messages were deleted.
 */
export function requireMessageCipher(ctx: ServiceContext): MessageCipher {
  if (!ctx.messageCipher) throw errors.messagingUnavailable()
  return ctx.messageCipher
}
