import { z } from 'zod'

import type {
  chatListFilterSchema,
  chatListResponseSchema,
  chatResponseSchema,
  chatResponseWithContentSchema,
  chatStreamFilterSchema,
  sendMessageSchema,
  chatActionRequestBodyPayloadSchema,
} from '#/features/chats/v1/chat.schema'

export type TSendMessage = z.infer<typeof sendMessageSchema>
export type TChatResponse = z.infer<typeof chatResponseSchema>
export type TChatResponseWithContent = z.infer<typeof chatResponseWithContentSchema>
export type TChatListResponse = z.infer<typeof chatListResponseSchema>
export type TChatListFilter = z.infer<typeof chatListFilterSchema>
export type TChatStreamFilter = z.infer<typeof chatStreamFilterSchema>
export type TChatActionRequestBodyPayload = z.infer<typeof chatActionRequestBodyPayloadSchema>
