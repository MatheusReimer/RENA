import { tasteService } from '@revy/core'
import { useAuthenticatedContext } from '../../utils/context'
import { defineApiHandler } from '../../utils/handler'

/**
 * The viewer's onboarding answers (SPEC 21).
 *
 * `null` means never asked, which is what the onboarding screen uses to decide
 * whether to show itself or send the reader on. A row with `skipped: true` is
 * a different answer: we asked, they declined.
 */
export default defineApiHandler(async (event) => {
  const ctx = await useAuthenticatedContext(event)
  return { taste: await tasteService.get(ctx) }
})
