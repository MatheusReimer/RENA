import { discoverService } from '@revy/core'
import { mediaTypeSchema } from '@revy/shared/schemas'
import { z } from 'zod'
import { useServiceContext } from '../utils/context'
import { defineApiHandler, readValidatedQueryOrThrow } from '../utils/handler'

/**
 * Discover sections (SPEC 21).
 *
 * Open to signed-out callers -- trending and popular are public. Friend
 * sections are simply absent without a session, because the service omits
 * empty sections rather than returning bare headings.
 */
export default defineApiHandler(async (event) => {
  const { type } = readValidatedQueryOrThrow(
    event,
    z.object({ type: mediaTypeSchema.optional() }),
  )
  const ctx = await useServiceContext(event)

  return {
    sections: type
      ? await discoverService.getForType(ctx, type)
      : await discoverService.getSections(ctx),
  }
})
