import { describeRoute, resolver } from 'hono-openapi'

import { HTTP_ERROR_DESCRIPTIONS, HTTP_ERROR_EXAMPLE } from '#/common/constants/openapi.contant'
import { httpErrorResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { healthResponseSchema } from '#/features/health/v1/health.schema'

export const getHealthCheck = describeRoute({
  summary: 'Get API health information',
  description: "Gets the API's health status, uptime, and database connection status.",
  tags: [ERouteTag.HEALTH],
  security: [
    {
      ApiKeyAuth: [],
    },
  ],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] as string,
      content: {
        'application/json': {
          schema: resolver(
            healthResponseSchema.meta({ examples: [{ status: 'ok', data: { uptime: 0, timestamp: '' } }] }),
          ),
        },
      },
    },
    500: {
      description: HTTP_ERROR_DESCRIPTIONS[500] as string,
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['500'] })),
        },
      },
    },
  },
})
