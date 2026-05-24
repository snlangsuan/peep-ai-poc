import { describeRoute, resolver } from 'hono-openapi'
import { z } from 'zod'

import { DEFAULT_RESPONSE } from '#/common/constants/openapi.contant'
import { ERouteTag } from '#/common/types/openapi.type'
import { chatItemResponseSchema, chatSseEventSchema } from '#/features/chats/v1/chat.schema'

const successSchema = z.object({
  success: z.boolean(),
  jobId: z.string().optional(),
  message: z.string().optional(),
})

export const sendChatDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.CHAT],
  summary: 'Send chat message',
  description: 'Sends a chat message to a background processing queue.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully queued chat message',
      content: {
        'application/json': {
          schema: resolver(successSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const listChatDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.CHAT],
  summary: 'List chat history',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully retrieved chat history',
      content: {
        'application/json': {
          schema: resolver(chatItemResponseSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const streamChatDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.CHAT],
  summary: 'Stream chat events (SSE)',
  description: 'Opens a Server-Sent Events connection. Emits real-time events while the agent processes messages.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'SSE stream of chat events',
      content: {
        'text/event-stream': {
          schema: resolver(chatSseEventSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const triggerActionDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.CHAT],
  summary: 'Trigger button/action message',
  description: 'Triggers a specific action prompt (like listing expenses/todos/schedules, summarizing moods or fortune telling) on behalf of the user, processing it via the queue and SSE stream.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully triggered action',
      content: {
        'application/json': {
          schema: resolver(successSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})

export const updateMoodDoc: ReturnType<typeof describeRoute> = describeRoute({
  tags: [ERouteTag.CHAT],
  summary: 'Update daily mood via interactive card click',
  description: 'Submits user mood choice from the daily mood card, updating the card state (one-time clickable) and storing the mood entry.',
  security: [{ ApiKeyAuth: [] }],
  responses: {
    200: {
      description: 'Successfully updated daily mood',
      content: {
        'application/json': {
          schema: resolver(successSchema),
        },
      },
    },
    ...DEFAULT_RESPONSE,
  },
})



