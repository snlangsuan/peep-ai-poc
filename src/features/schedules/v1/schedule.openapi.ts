import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { successResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { scheduleResponseSchema, scheduleItemResponseSchema } from '#/features/schedules/v1/schedule.schema'

export const createDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.SCHEDULE],
  summary: 'Create a schedule',
  description: 'Creates a new schedule for the authenticated user.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully created schedule',
      content: {
        'application/json': {
          schema: resolver(scheduleResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const getDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.SCHEDULE],
  summary: 'Get a schedule',
  description: 'Retrieves a single schedule by its UUID. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved schedule',
      content: {
        'application/json': {
          schema: resolver(scheduleResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const listDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.SCHEDULE],
  summary: 'Get schedule list',
  description: 'Retrieves all schedules belonging to the authenticated user. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved schedule list',
      content: {
        'application/json': {
          schema: resolver(scheduleItemResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const updateDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.SCHEDULE],
  summary: 'Update a schedule',
  description: 'Updates an existing schedule. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully updated schedule',
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
  tags: [ERouteTag.SCHEDULE],
  summary: 'Remove a schedule',
  description: 'Deletes an existing schedule. Requires x-api-key.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully deleted schedule',
      content: {
        'application/json': {
          schema: resolver(successResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})
