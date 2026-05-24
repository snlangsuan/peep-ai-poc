import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { successResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { todoResponseSchema, todoItemResponseSchema } from '#/features/todos/v1/todo.schema'

export const createDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.TODO],
  summary: 'Create a todo',
  description: 'Creates a new todo for the authenticated user.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully created todo',
      content: {
        'application/json': {
          schema: resolver(todoResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const getDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.TODO],
  summary: 'Get a todo',
  description: 'Retrieves a single todo by its UUID. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved todo',
      content: {
        'application/json': {
          schema: resolver(todoResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const listDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.TODO],
  summary: 'Get todo list',
  description: 'Retrieves all todos belonging to the authenticated user. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved todo list',
      content: {
        'application/json': {
          schema: resolver(todoItemResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const updateDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.TODO],
  summary: 'Update a todo',
  description: 'Updates an existing todo. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully updated todo',
      content: {
        'application/json': {
          schema: resolver(successResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const deleteDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.TODO],
  summary: 'Remove a todo',
  description: 'Deletes an existing todo. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully deleted todo',
      content: {
        'application/json': {
          schema: resolver(successResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
