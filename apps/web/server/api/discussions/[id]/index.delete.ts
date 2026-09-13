import { discussionService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/** Deletes a thread. Ownership is enforced in the service (SPEC 27). */
export default defineApiHandler(async (event) => {
  const threadId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useAuthenticatedContext(event)
  await discussionService.removeThread(ctx, threadId)
  return { ok: true }
})
