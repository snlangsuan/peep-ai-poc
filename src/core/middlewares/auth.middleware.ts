import { HTTPException } from 'hono/http-exception'
import type { MiddlewareHandler } from 'hono'

export const authMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const apiKey = c.req.header('x-api-key')

    if (!apiKey) {
      throw new HTTPException(401, {
        message: 'Request had invalid authentication credentials. (Missing x-api-key)',
      })
    }

    await next()
  }
}
