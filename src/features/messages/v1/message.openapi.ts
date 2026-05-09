import { describeRoute, resolver } from 'hono-openapi'
import { ERouteTag } from '#/common/types/openapi.type'
import { HTTP_ERROR_DESCRIPTIONS, HTTP_ERROR_EXAMPLE } from '#/common/constants/openapi.contant'
import { extractMessageResponseSchema } from '#/features/messages/v1/message.schema'
import { httpErrorResponseSchema } from '#/common/schemas/response.schema'

export const extractMessageDoc = describeRoute({
  summary: 'Extract information from message',
  description: 'Extract structured information such as expenses or schedules from a raw message string.',
  tags: [ERouteTag.MESSAGE],
  security: [{ BearerAuth: [] }],
  responses: {
    201: {
      description: HTTP_ERROR_DESCRIPTIONS[201] as string,
      content: {
        'application/json': {
          schema: resolver(extractMessageResponseSchema),
        },
      },
    },
    400: {
      description: HTTP_ERROR_DESCRIPTIONS[400] as string,
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['400'] })),
        },
      },
    },
    404: {
      description: HTTP_ERROR_DESCRIPTIONS[404] as string,
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['404'] })),
        },
      },
    },
  },
})