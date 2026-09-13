import { discussionService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/** A thread with its full nested comment tree (SPEC 14). */
export default defineApiHandler(async (event) => {
  const threadId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useServiceContext(event)
  return discussionService.getThread(ctx, threadId)
})
