import { schema } from '@revy/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { H3Event } from 'h3'
import { useDatabase } from './db'

/**
 * Better Auth instance (SPEC 26).
 *
 * SPEC 26 forbids hand-rolling password hashing and session management, and
 * requires authentication stay independent of the user domain model. Better
 * Auth owns the `auth_*` tables; `users` is ours and linked by `auth_user_id`.
 */

function buildAuth(secret: string, baseURL: string) {
  return betterAuth({
    secret,
    ...(baseURL ? { baseURL } : {}),

    database: drizzleAdapter(useDatabase(), {
      provider: 'pg',
      // Our tables are prefixed `auth_`, so the model-to-table mapping is
      // explicit rather than relying on Better Auth's default names.
      schema: {
        user: schema.authUser,
        session: schema.authSession,
        account: schema.authAccount,
        verification: schema.authVerification,
      },
    }),

    emailAndPassword: {
      enabled: true,
      // Email delivery is not wired up for the MVP; requiring verification
      // would lock every new account out. Turn this on with the mail provider.
      requireEmailVerification: false,
      minPasswordLength: 8,
    },

    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: true, maxAge: 60 * 5 },
    },

    advanced: {
      defaultCookieAttributes: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
      },
    },
  })
}

/**
 * The type is inferred from the builder rather than written as
 * `Auth<BetterAuthOptions>`: Better Auth's return type is parameterised by the
 * exact options object, so a hand-written annotation does not match.
 */
type AuthInstance = ReturnType<typeof buildAuth>

let instance: AuthInstance | null = null

export function useAuth(): AuthInstance {
  if (instance) return instance

  const config = useRuntimeConfig()

  if (!config.authSecret) {
    throw createError({
      statusCode: 503,
      data: {
        error: { code: 'INTERNAL_ERROR', message: 'The service is not configured correctly.' },
      },
    })
  }

  instance = buildAuth(config.authSecret, config.public.appUrl)
  return instance
}

/** The authenticated auth-layer session for a request, or null. */
export async function getAuthSession(event: H3Event) {
  return useAuth().api.getSession({ headers: event.headers })
}
