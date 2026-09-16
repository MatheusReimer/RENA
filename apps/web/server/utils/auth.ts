import { createMailer } from '@revy/core'
import { schema } from '@revy/db'
import { AUTH_LINK_TTL_SECONDS, NATIVE_APP_ORIGINS } from '@revy/shared/constants'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer } from 'better-auth/plugins'
import type { H3Event } from 'h3'
import { useDatabase } from './db'
import { recordVerificationMailFailure } from './verification-mail'

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

    /*
     * The native apps (SPEC 4).
     *
     * A sign-in with no cookie on it still has its `Origin` checked against
     * this list -- Better Auth's defence against a cross-site form logging
     * somebody into an attacker's account -- and the apps' origins are not
     * the deployment's. Without them every sign-in from a phone is a 403.
     */
    trustedOrigins: [...NATIVE_APP_ORIGINS],

    /*
     * Sessions for clients that cannot hold our cookie.
     *
     * iOS blocks cookies from a site other than the page's, and to the app's
     * WebView that is every API response. This lets the same session travel as
     * `Authorization: Bearer` instead. The plugin also copies the token into a
     * readable response header, which the web must never see -- httpOnly is
     * the point of the cookie -- so `[...all].ts` and `register.post.ts` strip
     * it from every response that is not going to an app.
     */
    plugins: [bearer()],

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
       * False here, and the address is still required -- the wall is ours.
       *
       * This reads like the gate is off. It is not: `useAuthenticatedContext`
       * refuses every authenticated route until the flag is true, and
       * `middleware/verified.global.ts` sends the reader to the wall screen.
       * Turning this on as well would be the same rule enforced twice, badly.
       *
       * Better Auth's version refuses to establish a session at all. That
       * leaves nowhere to explain anything: no session means no `/api/me`, no
       * resend endpoint that can read the address off the session, and no
       * screen to say why the password that was just typed correctly did not
       * work. Somebody whose confirmation mail never arrived would be left
       * with a sign-in form that rejects them forever.
       *
       * Letting the session exist and walling what it can reach keeps the
       * reader somewhere they can be told what happened and press Resend.
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
       * It is no longer only swallowed, because it can no longer only be a
       * log line. `requireEmailVerification` is still false -- Better Auth's
       * own gate refuses the session, which would leave nowhere to explain
       * anything -- but the app gates every authenticated route on the flag
       * instead, so an unconfirmed account is now walled rather than merely
       * limited. A send that fails silently is therefore an account that
       * cannot be used and cannot be told why.
       *
       * So the failure is recorded as well as logged, and the wall screen
       * reads it. The sign-up still succeeds: rolling it back would turn the
       * 403 this comment already describes into a total sign-up outage rather
       * than a recoverable one, and Resend on the wall screen is the recovery.
       *
       * `sendResetPassword` deliberately does NOT do this: there the mail *is*
       * the flow, and failing quietly leaves somebody waiting on an email that
       * is never coming.
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
          await recordVerificationMailFailure(user.id)
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
