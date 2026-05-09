import { describeRoute, resolver } from 'hono-openapi'

import { HTTP_ERROR_DESCRIPTIONS, HTTP_ERROR_EXAMPLE } from '#/common/constants/openapi.contant'
import { httpErrorResponseSchema, successResponseSchema } from '#/common/schemas/response.schema'
import { ERouteTag } from '#/common/types/openapi.type'
import { chatListResponseSchema, chatResponseSchema } from '#/features/chats/v1/chat.schema'

export const sendChatDoc = describeRoute({
  summary: 'Send a chat message',
  description: 'Sends a new message to another user.',
  tags: [ERouteTag.CHAT],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    201: {
      description: HTTP_ERROR_DESCRIPTIONS[201] ?? '',
      content: {
        'application/json': {
          schema: resolver(chatResponseSchema),
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

export const listChatDoc = describeRoute({
  summary: 'List chat history',
  description: 'Retrieves paginated chat history between the current user and another user.',
  tags: [ERouteTag.CHAT],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: HTTP_ERROR_DESCRIPTIONS[200] ?? '',
      content: {
        'application/json': {
          schema: resolver(chatListResponseSchema),
        },
      },
    },
  },
})

export const streamChatDoc = describeRoute({
  summary: 'Stream chat messages',
  description: 'Establishes a Server-Sent Events (SSE) connection to receive real-time chat updates.',
  tags: [ERouteTag.CHAT],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'SSE stream established.',
      content: {
        'text/event-stream': {
          schema: { type: 'string' },
        },
      },
    },
  },
})
export const actionExpensesDoc = describeRoute({
  summary: 'Trigger expense summary',
  description: 'Triggers the AI to provide a summary of expenses in the chat.',
  tags: [ERouteTag.CHAT],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    201: {
      description: 'Action triggered successfully.',
      content: { 'application/json': { schema: resolver(successResponseSchema) } },
    },
  },
})

export const actionSchedulesDoc = describeRoute({
  summary: 'Trigger schedule summary',
  description: 'Triggers the AI to provide a summary of schedules in the chat.',
  tags: [ERouteTag.CHAT],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    201: {
      description: 'Action triggered successfully.',
      content: { 'application/json': { schema: resolver(successResponseSchema) } },
    },
  },
})
export const actionOverallSummaryDoc = describeRoute({
  summary: 'Trigger overal summary',
  description: 'Triggers the AI to provide a overal summary of everything in the chat.',
  tags: [ERouteTag.CHAT],
  security: [{ ApiKeyAuth: [] }],
  responses: {
    201: {
      description: 'Action triggered successfully.',
      content: { 'application/json': { schema: resolver(successResponseSchema) } },
    },
  },
})
