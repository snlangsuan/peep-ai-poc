import { describeRoute, resolver } from 'hono-openapi'

import { HTTP_ERROR_DESCRIPTIONS, HTTP_ERROR_EXAMPLE } from '#/common/constants/openapi.contant'
import { httpErrorResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { scheduleListResponseSchema, scheduleResponseSchema } from '#/features/schedules/v1/schedule.schema'

export const createScheduleDoc = describeRoute({
  summary: 'Add a new schedule',
  description: 'Records a new planned event or schedule in the workspace.',
  tags: [ERouteTag.SCHEDULE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    201: {
      description: HTTP_ERROR_DESCRIPTIONS[201] ?? '',
      content: {
        'application/json': {
          schema: resolver(scheduleResponseSchema),
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

export const listScheduleDoc = describeRoute({
  summary: 'List schedules',
  description: 'Retrieves a list of all schedules recorded in the workspace.',
  tags: [ERouteTag.SCHEDULE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(scheduleListResponseSchema),
        },
      },
    },
  },
})

export const getScheduleDoc = describeRoute({
  summary: 'Get a schedule',
  description: 'Retrieves details of a specific schedule.',
  tags: [ERouteTag.SCHEDULE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(scheduleResponseSchema),
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

export const updateScheduleDoc = describeRoute({
  summary: 'Update a schedule',
  description: 'Modifies an existing schedule record.',
  tags: [ERouteTag.SCHEDULE],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(scheduleResponseSchema),
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

export const deleteScheduleDoc = describeRoute({
  summary: 'Delete a schedule',
  description: 'Removes a schedule record from the workspace.',
  tags: [ERouteTag.SCHEDULE],
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
