import { discussionService } from '@revy/core'
import { createThreadSchema } from '@revy/shared/schemas'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/** Opens a discussion thread, optionally with its first comment (SPEC 14). */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, createThreadSchema)
  const ctx = await useAuthenticatedContext(event)
  return { thread: await discussionService.createThread(ctx, input) }
})
