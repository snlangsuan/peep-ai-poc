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

export const periodDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.SUMMARY],
  summary: 'Assistant usage summary for a period',
  description:
    'Aggregates todos, schedules, expenses and moods over a period (Asia/Bangkok) then produces 5 highlights + 1 recommendation in Thai. Accepts a named `period` (today, yesterday, 7d, 30d, this_week, this_month) OR an explicit `start_date`+`end_date` range; defaults to the current month. The response echoes `start_date`/`end_date`. Accounting carry-over (opening/closing/budget) is filled only for a full calendar month; otherwise null. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully generated summary',
      content: {
        'application/json': {
          schema: resolver(summaryMonthlyResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
