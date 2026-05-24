import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE, HTTP_ERROR_DESCRIPTIONS, HTTP_ERROR_EXAMPLE } from '#/common/constants/openapi.contant'
import { httpErrorResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { userResponseSchema, userLoginResponseSchema } from '#/features/users/v1/user.schema'

export const createDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.USER],
  summary: 'Register a new user',
  description:
    'Registers a new user with username, password and password confirmation, returning their UUID and API Key.',
  security: [],
  responses: {
    200: {
      description: 'Successfully registered',
      content: {
        'application/json': {
          schema: resolver(userResponseSchema),
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
    500: {
      description: HTTP_ERROR_DESCRIPTIONS[500] ?? '',
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['500'] })),
        },
      },
    },
  },
})

export const loginDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.USER],
  summary: 'Login a user',
  description: 'Authenticates an existing user with username and password, returning their UUID and API Key.',
  security: [],
  responses: {
    200: {
      description: 'Successfully authenticated',
      content: {
        'application/json': {
          schema: resolver(userLoginResponseSchema),
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
    500: {
      description: HTTP_ERROR_DESCRIPTIONS[500] ?? '',
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['500'] })),
        },
      },
    },
  },
})

export const getInfoDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.USER],
  summary: 'Get user info',
  description: 'Retrieves user information including UUID and username. Requires header x-api-key authentication.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved user info',
      content: {
        'application/json': {
          schema: resolver(userResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
