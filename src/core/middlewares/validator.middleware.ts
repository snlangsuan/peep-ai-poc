import { validator } from 'hono-openapi'

import InvalidParameterException from '#/common/exceptions/invalid.parameter.exception'
import { parseValidateErrorDetails } from '#/common/utils/format.util'

import type { Context, Next, MiddlewareHandler } from 'hono'
import type { ValidationTargets } from 'hono/types'
import type { ZodError, z } from 'zod'

export const zValidator = (target: keyof ValidationTargets, schema: z.ZodTypeAny): MiddlewareHandler => {
  return validator(target, schema, (result: { success: boolean; error?: unknown }, c: Context) => {
    if (!result.success) {
      const details = parseValidateErrorDetails(result.error as ZodError['issues'])
      const message =
        c.req.method === 'GET'
          ? `The query string has ${details.length} error(s)`
          : `The request body has ${details.length} error(s)`
      const error = new InvalidParameterException(message, 400, details)
      return c.json(error.toJson(), error.statusCode)
    }
  })
}

export const uploadBinaryValidate = (support: string[] = []): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const body = await c.req.blob()
    const mimeType = body.type
    if (!support.includes(mimeType)) {
      const error = new InvalidParameterException('The content-type is invalid.')
      return c.json(error.toJson(), error.statusCode)
    }
    await next()
  }
}
