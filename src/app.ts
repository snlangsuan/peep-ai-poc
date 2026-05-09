import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'

import { errorHandler, notFoundHandler } from '#/core/middlewares/error.handler'
import { loggerMiddleware } from '#/core/middlewares/logger.middleware'
import { envVariables } from '#/factory'
import { registerV1Docs } from '#/infrastructure/http/openapi/v1-spec'
import v1Route from '#/infrastructure/http/routes/v1'
import { serveStatic } from 'hono/bun'

import type { Bindings, Variables } from '#/common/types/app.type'

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use(requestId())
app.use(secureHeaders())
app.use(
  '/api/*',
  cors({
    origin: envVariables.WHITE_LIST_ORIGINS,
  }),
)
app.use('/api/*', loggerMiddleware())

if (envVariables.NODE_ENV !== 'production') {
  registerV1Docs(app)
}

app.route('/api/v1', v1Route)

app.get('/*', serveStatic({ root: 'src/public' }))

app.onError(errorHandler)
app.notFound(notFoundHandler)

export default app
