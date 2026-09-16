import { createMailer } from '@revy/core'
import type { ReportReason, ReportTarget } from '@revy/shared/constants'

/**
 * Tells a moderator a report was filed.
 *
 * The store guidelines ask for objectionable content to be acted on within 24
 * hours of a report, and nobody watches a database table. The row is the
 * record; this is the thing that makes somebody look at it.
 *
 * Deliberately carries no reported text. Message bodies are encrypted at rest
 * and reviews can be long; what a moderator needs from a mail is that a report
 * exists, what kind, and the link that opens it. Mail is also the one place
 * this content would sit in plaintext outside the database.
 */
export interface ReportNotice {
  reportId: string
  targetType: ReportTarget
  targetId: string
  reason: ReportReason
  reporterUsername: string
  note: string | null
  openReports: number
}

const NEWLINE = '\n'

/**
 * Sends the notice, or explains in the log why it could not.
 *
 * Never throws: the report is already stored by the time this runs, and a
 * mail provider having a bad minute must not turn a filed report into an error
 * on the reader's screen. They did their part.
 */
export async function sendReportNotice(
  config: { resendApiKey: string; from: string; to: string; appUrl: string },
  notice: ReportNotice,
): Promise<void> {
  if (!config.to) {
    console.warn(
      `[revy] report ${notice.reportId} filed with no moderation address configured;` +
        ' set NUXT_MODERATION_EMAIL so somebody hears about it.',
    )
    return
  }

  const link = config.appUrl ? `${config.appUrl}/${targetPath(notice)}` : targetPath(notice)

  /*
   * Building the mailer is inside the try, not before it.
   *
   * `createMailer` throws in production when no mail credentials are set --
   * deliberately, because the alternative is printing password-reset links
   * into a log. Constructed outside this block, that throw escaped into the
   * request and answered a reader who had just reported something vile with
   * a 500, even though their report was already stored. They did their part.
   */
  let mailer: ReturnType<typeof createMailer> | null = null

  try {
    mailer = createMailer({
      resendApiKey: config.resendApiKey,
      from: config.from,
      isProduction: process.env.NODE_ENV === 'production',
    })

    await mailer.send({
      to: config.to,
      subject: `RENA report: ${notice.reason} on a ${notice.targetType}`,
      text: [
        `${notice.reporterUsername} reported a ${notice.targetType}.`,
        '',
        `Reason: ${notice.reason}`,
        notice.note ? `Note: ${notice.note}` : null,
        '',
        `Where: ${link}`,
        `Report id: ${notice.reportId}`,
        '',
        `${notice.openReports} report(s) now open.`,
        '',
        'The guidelines both stores enforce ask for a decision within 24 hours.',
      ]
        .filter((line) => line !== null)
        .join(NEWLINE),
    })
  } catch (error) {
    /*
     * Logged without the note, which is somebody's words about somebody else.
     *
     * `mailer` is null when the failure was building it -- no credentials --
     * which is a different problem from a send that was refused, and the log
     * line has to be able to say which.
     */
    console.error(
      `[revy] could not mail report ${notice.reportId}` +
        (mailer ? ` via "${mailer.kind}"` : ' (no mail transport configured)'),
      error instanceof Error ? error.message : error,
    )
  }
}

/** Where a moderator goes to see the thing, as far as a URL can say. */
function targetPath(notice: ReportNotice): string {
  switch (notice.targetType) {
    case 'review':
      return `reviews/${notice.targetId}`
    case 'thread':
    case 'comment':
      return `discussions/${notice.targetId}`
    case 'list':
      return `lists/${notice.targetId}`
    case 'user':
      return `u/${notice.targetId}`
    // A direct message has no page anybody outside the conversation can open.
    case 'message':
      return `messages (conversation not linkable; report id ${notice.reportId})`
    default:
      return ''
  }
}
