import { personService } from '@revy/core'
import { uuidSchema } from '@revy/shared/schemas'
import { useServiceContext } from '../../../utils/context'
import { defineApiHandler } from '../../../utils/handler'

/** A person and their body of work. */
export default defineApiHandler(async (event) => {
  const personId = uuidSchema.parse(getRouterParam(event, 'id'))
  const ctx = await useServiceContext(event)
  return { person: await personService.get(ctx, personId) }
})
