import { notificationService } from '@revy/core'
import { notificationQuerySchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../utils/handler'

/** Notifications, filtered and cursor-paginated (SPEC 23). */
export default defineApiHandler(async (event) => {
  const input = readValidatedQueryOrThrow(event, notificationQuerySchema)
  const ctx = await useAuthenticatedContext(event)
  return notificationService.list(ctx, input)
})
