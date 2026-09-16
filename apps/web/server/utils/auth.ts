import { createMailer } from '@revy/core'
import { schema } from '@revy/db'
import { AUTH_LINK_TTL_SECONDS } from '@revy/shared/constants'
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

/** Line break for the plain-text bodies below. */
const NEWLINE = '\n'

function buildAuth(secret: string, baseURL: string, mailer: ReturnType<typeof createMailer>) {
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
      /*
       * Verification is sent but does not gate sign-in.
       *
       * Blocking the first session until somebody has been to their inbox is
       * the single largest drop-off in any sign-up flow, and the risk it
       * mitigates -- someone registering an address they do not own -- is
       * small on a product where the account owns nothing but opinions. The
       * address is confirmed, the flag is stored, and gating specific actions
       * on it later is one condition rather than a migration.
       */
      requireEmailVerification: false,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: AUTH_LINK_TTL_SECONDS,

      /*
       * Reset mail.
       *
       * Better Auth only calls this when the address exists, and deliberately
       * returns the same response either way -- so the endpoint cannot be used
       * to discover who has an account (OWASP A07). The client copy has to
       * keep that promise, which is why the confirmation screen says "if that
       * address has an account" rather than "sent".
       */
      async sendResetPassword({ user, url }) {
        await mailer.send({
          to: user.email,
          subject: 'Reset your RENA password',
          text: [
            'Somebody asked to reset the password on your RENA account.',
            '',
            url,
            '',
            'The link works once and expires in an hour.',
            'If this was not you, nothing has changed and you can ignore this.',
          ].join(NEWLINE),
        })
      },

      /*
       * Every existing session is dropped when a password changes.
       *
       * The common reason somebody resets a password is that they think
       * another person has it. Leaving that person signed in on their own
       * device would make the reset theatre.
       */
      revokeSessionsOnPasswordReset: true,
    },

    emailVerification: {
      sendOnSignUp: true,
      // A fresh link whenever somebody follows an expired one, rather than a
      // dead end that tells them to find the newer email they do not have.
      autoSignInAfterVerification: true,
      expiresIn: AUTH_LINK_TTL_SECONDS,

      /*
       * A failed send must not fail the sign-up.
       *
       * Better Auth calls this during registration, and an exception here
       * propagates out of the request: the account row is written, the
       * response is a 500, no session cookie is set, and the new user lands
       * on an onboarding page where every request is a 401 and the screen is
       * empty. That is exactly what an unverified Resend sending domain --
       * a 403 on send -- did to this app in production.
       *
       * Swallowing it is only defensible because `requireEmailVerification`
       * is false above. The address stays unconfirmed and the account works,
       * which is the trade already made there. `sendResetPassword`
       * deliberately does NOT do this: there the mail *is* the flow, and
       * failing quietly leaves somebody waiting on an email that is never
       * coming.
       */
      async sendVerificationEmail({ user, url }) {
        try {
          await mailer.send({
            to: user.email,
            subject: 'Confirm your email for RENA',
            text: [
              `Welcome to RENA, ${user.name || 'there'}.`,
              '',
              'Confirm this address so we can reach you about your account:',
              '',
              url,
              '',
              'The link expires in an hour. If you did not sign up, ignore this.',
            ].join(NEWLINE),
          })
        } catch (error) {
          /*
           * Neither the address nor the link goes in the log line. The link
           * is a bearer token and the address says who just signed up; this
           * lands in a shared aggregator. The transport and the provider's
           * own (already sanitised) message are enough to diagnose it.
           */
          console.error(
            `[revy] confirmation mail failed via "${mailer.kind}"; sign-up continued.`,
            error instanceof Error ? error.message : error,
          )
        }
      },
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

  const mailer = createMailer({
    resendApiKey: config.mailResendApiKey,
    from: config.mailFrom,
    isProduction: process.env.NODE_ENV === 'production',
  })

  instance = buildAuth(config.authSecret, config.public.appUrl, mailer)
  return instance
}

/** The authenticated auth-layer session for a request, or null. */
export async function getAuthSession(event: H3Event) {
  return useAuth().api.getSession({ headers: event.headers })
}
