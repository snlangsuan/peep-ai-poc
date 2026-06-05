import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import { horoscopeItemResponseSchema } from '#/features/horoscopes/v1/horoscope.schema'

export const listDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.HOROSCOPE],
  summary: 'Get daily horoscopes',
  description:
    'Retrieves the daily horoscope for all 12 zodiac signs for a given prediction date. Provide `date` (YYYY-MM-DD) to choose the day — defaults to today (Asia/Bangkok). Optionally pass `sign` (e.g. "leo") to fetch a single sign.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved horoscopes',
      content: {
        'application/json': {
          schema: resolver(horoscopeItemResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
