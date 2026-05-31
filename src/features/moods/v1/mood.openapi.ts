import { describeRoute, resolver } from 'hono-openapi'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import { moodResponseSchema, moodItemResponseSchema } from '#/features/moods/v1/mood.schema'

export const createDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.MOOD],
  summary: 'Create a mood record',
  description:
    'Records the current mood of the authenticated user. The server stamps today\'s local date automatically — clients only provide `emotion` (required) and optional `note`.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully created mood',
      content: {
        'application/json': {
          schema: resolver(moodResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const listDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.MOOD],
  summary: 'Get mood list',
  description:
    'Retrieves a paginated list of moods belonging to the authenticated user with optional `start_date`, `end_date`, and `emotion` filters.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved mood list',
      content: {
        'application/json': {
          schema: resolver(moodItemResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
