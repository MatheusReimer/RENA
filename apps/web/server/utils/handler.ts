import type { ApiErrorBody } from '@revy/shared/types'
import { DomainError, isDomainError } from '@revy/shared/utils'
import type { EventHandler, EventHandlerRequest, H3Event } from 'h3'
import { z } from 'zod'

/**
 * The API boundary (SPEC 25, 35, 39).
 *
 * Every route is wrapped by `defineApiHandler`, which guarantees three things
 * a per-handler try/catch would eventually get wrong somewhere:
 *
 *  1. Every error leaves as the documented `{ error: { code, message } }`
 *     envelope, never a stack trace or a driver message (SPEC 35, 39).
 *  2. Anything that is not a `DomainError` is logged server-side and reported
 *     as a generic INTERNAL_ERROR -- an unexpected throw can never leak
 *     internals to a client.
 *  3. Zod failures become field-level validation errors the forms can render.
 */
export function defineApiHandler<T extends EventHandlerRequest, D>(
  handler: (event: H3Event<T>) => Promise<D>,
): EventHandler<T, Promise<D | ApiErrorBody>> {
  return defineEventHandler(async (event) => {
    try {
      return await handler(event)
    } catch (error) {
      const { status, body } = toErrorResponse(error)

      // Returned rather than thrown, deliberately. Throwing a createError()
      // makes Nitro wrap the payload in its own `{ error, url, statusCode,
      // data }` envelope, which would bury our `code` two levels deep and
      // break the contract SPEC 35 documents. Setting the status and returning
      // the body sends exactly `{ error: { code, message } }`.
      setResponseStatus(event, status)
      return body
    }
  })
}

/**
 * Applies the error envelope from outside `defineApiHandler`.
 *
 * Middleware and the Better Auth catch-all are plain event handlers, so a
 * thrown DomainError would otherwise escape as Nitro's own error shape --
 * which buries our `code` and, in development, includes a stack trace. SPEC 39
 * says internals never reach a client, and "except on three routes" is not a
 * version of that worth having.
 */
export function sendDomainError(event: H3Event, error: unknown): ApiErrorBody {
  const { status, body } = toErrorResponse(error)
  setResponseStatus(event, status)
  return body
}

function toErrorResponse(error: unknown): { status: number; body: ApiErrorBody } {
  // Zod threw before a service was reached: surface which fields failed.
  if (error instanceof z.ZodError) {
    const fields: Record<string, string[]> = {}
    for (const issue of error.issues) {
      const path = issue.path.join('.') || '_'
      ;(fields[path] ??= []).push(issue.message)
    }
    return {
      status: 422,
      body: {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Some fields need attention.',
          fields,
        },
      },
    }
  }

  if (isDomainError(error)) {
    return { status: error.status, body: error.toBody() }
  }

  // An H3 error that already carries our envelope (thrown by useDatabase etc).
  if (isH3ErrorWithEnvelope(error)) {
    return { status: error.statusCode, body: error.data }
  }

  // Anything else is a bug. Log the real thing, tell the client nothing.
  console.error('[revy] unhandled error', error)
  return {
    status: 500,
    body: new DomainError('INTERNAL_ERROR', 'Something went wrong on our end.').toBody(),
  }
}

interface H3ErrorWithEnvelope {
  statusCode: number
  data: ApiErrorBody
}

function isH3ErrorWithEnvelope(error: unknown): error is H3ErrorWithEnvelope {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { statusCode?: unknown; data?: { error?: { code?: unknown } } }
  return (
    typeof candidate.statusCode === 'number' &&
    typeof candidate.data?.error?.code === 'string'
  )
}

/**
 * Parses and validates a request body against a schema (SPEC 25).
 *
 * Using this rather than a bare `readBody` is what makes "every mutation is
 * validated" a structural property instead of a convention.
 */
export async function readValidatedBodyOrThrow<S extends z.ZodType>(
  event: H3Event,
  schema: S,
): Promise<z.output<S>> {
  const body = await readBody(event).catch(() => ({}))
  return schema.parse(body ?? {})
}

/** Same, for query parameters. */
export function readValidatedQueryOrThrow<S extends z.ZodType>(
  event: H3Event,
  schema: S,
): z.output<S> {
  return schema.parse(getQuery(event))
}
