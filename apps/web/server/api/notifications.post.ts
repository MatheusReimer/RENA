import { notificationService } from '@revy/core'
import { markNotificationsReadSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../utils/handler'

/** Marks notifications read. Omitting `ids` marks everything read (SPEC 23). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, markNotificationsReadSchema)
  const ctx = await useAuthenticatedContext(event)
  await notificationService.markRead(ctx, input.ids)
  return { ok: true }
})
