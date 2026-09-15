/**
 * Outbound email (SPEC 26).
 *
 * Same shape as the media providers: one small interface, a transport per
 * service, and nothing outside this folder knows which one is in use. Swapping
 * Resend for SES is a new file and one line in `createMailer`.
 *
 * Only transactional mail belongs here -- password resets and address
 * confirmation. The moment this grows a "campaign" or a "template id" it has
 * stopped being part of authentication and wants its own home.
 */

export interface MailMessage {
  to: string
  subject: string
  /** Always required. Some clients never render the HTML, and a mail with no
   *  text part arrives blank in those. */
  text: string
  html?: string
}

export interface Mailer {
  /** Resolves when the provider has accepted the message, not when it lands. */
  send(message: MailMessage): Promise<void>
  /** What this transport is, for the startup log. */
  readonly kind: string
}

export interface MailerConfig {
  /** Resend API key. The only hosted provider wired up so far. */
  resendApiKey?: string
  /** Envelope sender, e.g. 'RENA <hello@rena.app>'. Required by every provider. */
  from?: string
  /** Production refuses to fall back to the console transport. */
  isProduction: boolean
}

/**
 * Development transport: prints the message instead of sending it.
 *
 * This exists so the whole reset flow can be built and exercised without a
 * mail account -- the link is in the terminal, and the flow is otherwise
 * identical.
 *
 * It must never run in production, and `createMailer` enforces that rather
 * than trusting a comment: a password-reset link is a bearer token, and
 * printing one into a log aggregator hands an account to anyone with log
 * access. That is a worse failure than mail not working, because mail not
 * working is obvious and this is not.
 */
export function createConsoleMailer(): Mailer {
  return {
    kind: 'console',
    async send(message) {
      console.info(
        [
          '',
          '  ┌─ email (not sent: no provider configured) ──────────────',
          `  │ to:      ${message.to}`,
          `  │ subject: ${message.subject}`,
          '  │',
          ...message.text.trim().split('\n').map((line) => `  │ ${line}`),
          '  └─────────────────────────────────────────────────────────',
          '',
        ].join('\n'),
      )
    },
  }
}

/**
 * Refuses to send, loudly.
 *
 * Used in production when no provider is configured. The alternative -- the
 * console transport -- would silently succeed while writing reset tokens to
 * the logs, so this fails the request instead and makes the misconfiguration
 * something an operator sees on the first attempt rather than never.
 */
function createNullMailer(): Mailer {
  return {
    kind: 'none',
    async send() {
      throw new Error(
        'No mail provider is configured. Set MAIL_RESEND_API_KEY and MAIL_FROM.',
      )
    },
  }
}

/**
 * Resend, over plain `fetch`.
 *
 * No SDK: the API is one POST, and a dependency that wraps one POST is a
 * dependency to audit, update and eventually remove. The same reasoning the
 * media providers use.
 */
export function createResendMailer(apiKey: string, from: string): Mailer {
  return {
    kind: 'resend',
    async send(message) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
      })

      if (!response.ok) {
        /*
         * The body is read but not re-thrown verbatim.
         *
         * Provider errors quote the recipient address back, and this message
         * can reach a log shared with people who should not be reading who is
         * resetting their password. The status is enough to diagnose it.
         */
        await response.text().catch(() => '')
        throw new Error(`Resend rejected the message (${response.status}).`)
      }
    },
  }
}

/**
 * Picks a transport from configuration.
 *
 * Development without a key gets the console, which is what makes the flow
 * testable on day one. Production without a key gets a transport that throws,
 * because the failure has to be visible.
 */
export function createMailer(config: MailerConfig): Mailer {
  if (config.resendApiKey && config.from) {
    return createResendMailer(config.resendApiKey, config.from)
  }

  if (config.isProduction) return createNullMailer()

  return createConsoleMailer()
}
