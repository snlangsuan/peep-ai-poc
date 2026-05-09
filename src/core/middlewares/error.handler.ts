import { HTTPException } from 'hono/http-exception'

import ApplicationException from '#/common/exceptions/application.exception'
import { HttpException } from '#/common/exceptions/http.exception'
import ObjectNotFoundError from '#/common/exceptions/object.not.found.exception'
import { getErrorObject } from '#/common/utils/helper.util'

import type { Context, Env } from 'hono'

export const errorHandler = async (err: Error | HTTPException, c: Context) => {
  const { logger } = c.var
  logger?.error({ error: getErrorObject(err) }, err.message)
  if (err instanceof HttpException) {
    return c.json(err.toJson(), err.statusCode)
  }

  if (err instanceof HTTPException && err.status === 504) {
    const error = new ApplicationException('Request timeout.', 504)
    return c.json(error.toJson(), error.statusCode)
  }
  if (err instanceof HTTPException && err.status === 403) {
    const error = new ApplicationException('CSRF token Mismatch Error', 403)
    return c.json(error.toJson(), error.statusCode)
  }

  const error = new ApplicationException()
  return c.json(error.toJson(), error.statusCode)
}

export const notFoundHandler = <E extends Env, P extends string>(c: Context<E, P>) => {
  const error = new ObjectNotFoundError()
  return c.json(error.toJson(), error.statusCode)
}
