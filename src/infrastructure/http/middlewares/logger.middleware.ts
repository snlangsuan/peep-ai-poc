import { createMiddleware } from 'hono/factory'

import { pinoMiddleware as logging } from '#/common/libs/logger.lib'

import type { Bindings, Variables } from '#/common/types/app.type'
import type { Context, Next, MiddlewareHandler } from 'hono'

const getReqData = async (c: Context): Promise<Record<string, unknown> | undefined> => {
  try {
    const contentType = c.req.header('Content-Type')
    return contentType === 'application/json' ? await c.req.json() : undefined
  } catch {
    return
  }
}

export const loggerMiddleware = (): MiddlewareHandler =>
  createMiddleware(async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
    if (!c.env || !c.env.incoming) {
      await next()
      return
    }

    const { incoming, outgoing } = c.env
    const req = incoming as unknown as Parameters<typeof logging>[0]
    const res = outgoing as unknown as Parameters<typeof logging>[1]

    req.id = c.var.requestId

    const body = await getReqData(c)
    await new Promise<void>((resolve) => {
      logging(Object.assign(req, { raw: { body } }), res, () => resolve())
    })
    if (req.log) {
      c.set('logger', req.log)
    }

    await next()
  })
