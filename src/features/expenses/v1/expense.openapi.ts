import { describeRoute, resolver } from 'hono-openapi'

import { HTTP_ERROR_DESCRIPTIONS, HTTP_ERROR_EXAMPLE } from '#/common/constants/openapi.contant'
import { httpErrorResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { expenseListResponseSchema, expenseResponseSchema } from '#/features/expenses/v1/expense.schema'

export const createExpenseDoc = describeRoute({
  summary: 'Add a new expense',
  description: 'Records a new financial expense in the workspace.',
  tags: [ERouteTag.EXPENSE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    201: {
      description: HTTP_ERROR_DESCRIPTIONS[201] ?? '',
      content: {
        'application/json': {
          schema: resolver(expenseResponseSchema),
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

export const listExpenseDoc = describeRoute({
  summary: 'List expenses',
  description: 'Retrieves a list of all expenses recorded in the workspace.',
  tags: [ERouteTag.EXPENSE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(expenseListResponseSchema),
        },
      },
    },
  },
})

export const getExpenseDoc = describeRoute({
  summary: 'Get an expense',
  description: 'Retrieves details of a specific expense.',
  tags: [ERouteTag.EXPENSE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(expenseResponseSchema),
        },
      },
    },
    404: {
      description: HTTP_ERROR_DESCRIPTIONS[404] ?? '',
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['404'] })),
        },
      },
    },
  },
})

export const updateExpenseDoc = describeRoute({
  summary: 'Update an expense',
  description: 'Modifies an existing expense record.',
  tags: [ERouteTag.EXPENSE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(expenseResponseSchema),
        },
      },
    },
    404: {
      description: HTTP_ERROR_DESCRIPTIONS[404] ?? '',
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['404'] })),
        },
      },
    },
  },
})

export const deleteExpenseDoc = describeRoute({
  summary: 'Delete an expense',
  description: 'Removes an expense record from the workspace.',
  tags: [ERouteTag.EXPENSE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
    },
    404: {
      description: HTTP_ERROR_DESCRIPTIONS[404] ?? '',
      content: {
        'application/json': {
          schema: resolver(httpErrorResponseSchema.meta({ example: HTTP_ERROR_EXAMPLE['404'] })),
        },
      },
    },
  },
})
