import { Scalar } from '@scalar/hono-api-reference'
import { Hono } from 'hono'
import { openAPIRouteHandler } from 'hono-openapi'

import { DOC_PAGE_DESCRIPTION, DOC_PAGE_TITLE, TAG_DESCRIPTIONS } from '#/common/constants/openapi.contant'

import type { Bindings, Variables } from '#/common/types/app.type'

export const registerV1Docs = (app: Hono<{ Bindings: Bindings; Variables: Variables }>) => {
  app.get(
    '/poc/api/v1/openapi',
    openAPIRouteHandler(app, {
      documentation: {
        components: {
          securitySchemes: {
            BearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
            ApiKeyAuth: {
              type: 'apiKey',
              in: 'header',
              name: 'x-api-key',
            },
          },
        },
        info: {
          title: DOC_PAGE_TITLE,
          version: '1.0.0',
          description: DOC_PAGE_DESCRIPTION,
        },
        security: [{ bearerAuth: [] }],
        tags: [...TAG_DESCRIPTIONS],
      },
    }),
  )

  app.get(
    '/poc/api/v1/docs',
    Scalar({
      theme: 'purple',
      pageTitle: DOC_PAGE_TITLE,
      url: '/poc/api/v1/openapi',
    }),
  )
}
