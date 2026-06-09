import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { successResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { todoResponseSchema, todoItemResponseSchema, todoBatchResponseSchema } from '#/features/todos/v1/todo.schema'

export const createDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.TODO],
  summary: 'Create todos',
  description:
    'Creates one or more todos for the authenticated user. The body takes a `todos` array (1–50 items); a single todo is just an array of length 1. Returns the created todos as `{ items: [...] }`.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully created todos',
      content: {
        'application/json': {
          schema: resolver(todoBatchResponseSchema),
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
  summary: 'Update todos',
  description:
    'Updates one or more existing todos for the authenticated user. The body takes a `todos` array (1–50 items); each item carries its own `uuid` plus the fields to change (`title`/`description`/`completed`). The update is all-or-nothing: if any uuid is missing or not owned by the user, nothing is changed. Returns the updated todos as `{ items: [...] }`. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully updated todos',
      content: {
        'application/json': {
          schema: resolver(todoBatchResponseSchema),
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
