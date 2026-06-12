import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import { accountMonthResponseSchema } from '#/features/account/v1/account.schema'

export const getBalanceDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.ACCOUNT],
  summary: 'Get monthly balance',
  description:
    'Returns the accounting picture for a month: opening balance (carried over or overridden), income/expense totals, net, closing balance, and budget usage. Defaults to the current month.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully computed monthly balance',
      content: {
        'application/json': {
          schema: resolver(accountMonthResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const setOpeningBalanceDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.ACCOUNT],
  summary: 'Set opening balance',
  description:
    'Manually fixes the opening balance (เงินต้น) for a month, anchoring carry-over from that month forward. Returns the recomputed balance.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully set opening balance',
      content: {
        'application/json': {
          schema: resolver(accountMonthResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const setBudgetDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.ACCOUNT],
  summary: 'Set monthly budget',
  description: 'Sets (or clears, with null) the spending cap for a month. Returns the recomputed balance.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully set monthly budget',
      content: {
        'application/json': {
          schema: resolver(accountMonthResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
