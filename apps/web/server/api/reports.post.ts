import { moderationRepository, moderationService, userRepository } from '@revy/core'
import { reportSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../utils/handler'
import { RATE_LIMITS, assertRateLimit } from '../utils/rate-limit'
import { sendReportNotice } from '../utils/report-mail'

/**
 * Reports content or a person.
 *
 * Required by both stores for an app that carries other people's writing, and
 * the response is deliberately the same whether this is the first report of a
 * thing or the fifth from the same reader: "we have it". Telling somebody they
 * already reported this only invites them to find another way to say it.
 */
export default defineApiHandler(async (event) => {
  await assertRateLimit(event, RATE_LIMITS.report)

  const input = await readValidatedBodyOrThrow(event, reportSchema)
  const ctx = await useAuthenticatedContext(event)

  const { filed, reportId } = await moderationService.report(ctx, input)

  /*
   * Mailed only for a report that was actually filed.
   *
   * A duplicate stores nothing, so mailing one would put a notice in front of
   * a moderator with no row behind it -- and repeating the same report is the
   * cheapest way to make that happen on purpose.
   */
  if (filed && reportId) {
    const config = useRuntimeConfig()
    const reporter = await userRepository.findById(ctx.db, ctx.viewerId)

    await sendReportNotice(
      {
        resendApiKey: config.mailResendApiKey,
        from: config.mailFrom,
        to: config.moderationEmail,
        appUrl: config.public.appUrl,
      },
      {
        reportId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        reporterUsername: reporter?.username ?? 'unknown',
        note: input.note ?? null,
        openReports: await moderationRepository.openReportCount(ctx.db),
      },
    )
  }

  return { received: true }
})
