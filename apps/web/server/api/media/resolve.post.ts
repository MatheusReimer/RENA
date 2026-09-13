import { mediaService } from '@revy/core'
import { resolveMediaSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../utils/context'
import { defineApiHandler, readValidatedBodyOrThrow } from '../../utils/handler'

/**
 * Turns a provider search result into a local media row (SPEC 8).
 *
 * Called when a user opens a result that only exists in a provider. Idempotent:
 * opening the same title twice returns the same row.
 */
export default defineApiHandler(async (event) => {
  const input = await readValidatedBodyOrThrow(event, resolveMediaSchema)
  const ctx = await useServiceContext(event)
  return { media: await mediaService.resolve(ctx, input) }
})
