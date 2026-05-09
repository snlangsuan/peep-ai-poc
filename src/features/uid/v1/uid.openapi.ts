import { describeRoute, resolver } from 'hono-openapi'

import { HTTP_ERROR_DESCRIPTIONS, HTTP_ERROR_EXAMPLE } from '#/common/constants/openapi.contant'
import { httpErrorResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { uidResponseSchema } from '#/features/uid/v1/uid.schema'

export const generateUidDoc = describeRoute({
  summary: 'Generate a unique identifier',
  description: 'Creates a unique UUID v4 string, optionally with a custom prefix.',
  tags: [ERouteTag.UID],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(uidResponseSchema),
        },
      },
    },
    400: {
      description: HTTP_ERROR_DESCRIPTIONS[400] ?? '',
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['400'] })),
        },
      },
    },
  },
})

export const getProfileDoc = describeRoute({
  summary: 'Get user profile',
  description: 'Retrieves the profile information for the authenticated user, including remaining credits.',
  tags: [ERouteTag.UID],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(uidResponseSchema),
        },
      },
    },
    404: {
      description: 'Profile not found',
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema),
        },
      },
    },
  },
})
