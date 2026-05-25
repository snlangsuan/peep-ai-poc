import type { z } from 'zod'

import type {
  chatFilterPayloadSchema,
  chatCreatePayloadSchema,
  chatResponseSchema,
  chatItemResponseSchema,
  chatSseEventSchema,
  chatActionPayloadSchema,
  chatMoodUpdatePayloadSchema,
} from '#/features/chats/v1/chat.schema'

export type TChatFilterPayload = z.infer<typeof chatFilterPayloadSchema>
export type TChatCreatePayload = z.infer<typeof chatCreatePayloadSchema>
export type TChatResponse = z.infer<typeof chatResponseSchema>
export type TChatItemResponse = z.infer<typeof chatItemResponseSchema>
export type TChatSseEvent = z.infer<typeof chatSseEventSchema>
export type TChatActionPayload = z.infer<typeof chatActionPayloadSchema>
export type TChatMoodUpdatePayload = z.infer<typeof chatMoodUpdatePayloadSchema>


export type TChatRawResponse = {
  id?: string
  user_id?: string
  sender_id?: string
  message?: string
  created_at?: Date | string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  llm_credits?: number
  tool_credits?: number
  credits_used?: number
  tools?: Array<{ name: string; credits: number }>
}
