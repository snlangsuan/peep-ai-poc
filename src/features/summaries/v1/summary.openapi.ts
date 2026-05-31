import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import { summaryMonthlyResponseSchema } from '#/features/summaries/v1/summary.schema'

export const monthlyDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.SUMMARY],
  summary: 'Monthly assistant usage summary',
  description:
    'Aggregates todos, schedules, expenses and moods for the given year/month (Asia/Bangkok), then asks the AI to produce 5 highlights + 1 recommendation in Thai. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully generated monthly summary',
      content: {
        'application/json': {
          schema: resolver(summaryMonthlyResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
