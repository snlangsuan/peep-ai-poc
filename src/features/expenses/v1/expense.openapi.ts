import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { successResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { expenseResponseSchema, expenseItemResponseSchema } from '#/features/expenses/v1/expense.schema'

export const createDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.EXPENSE],
  summary: 'Create expense(s)',
  description: 'Creates a single expense or multiple expenses for the authenticated user.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully created expense(s)',
      content: {
        'application/json': {
          schema: resolver(expenseResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const getDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.EXPENSE],
  summary: 'Get an expense',
  description: 'Retrieves a single expense by its UUID. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved expense',
      content: {
        'application/json': {
          schema: resolver(expenseResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const listDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.EXPENSE],
  summary: 'Get expense list',
  description:
    'Retrieves a paginated list of expenses belonging to the authenticated user with optional date filtering.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved expense list',
      content: {
        'application/json': {
          schema: resolver(expenseItemResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const updateDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.EXPENSE],
  summary: 'Update an expense',
  description: 'Updates an existing expense. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully updated expense',
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
  tags: [ERouteTag.EXPENSE],
  summary: 'Remove an expense',
  description: 'Deletes an existing expense. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully deleted expense',
      content: {
        'application/json': {
          schema: resolver(successResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
