import type { z } from 'zod'

import type {
  chatFilterPayloadSchema,
  chatCreatePayloadSchema,
  chatResponseSchema,
  chatItemResponseSchema,
  chatSseEventSchema,
  chatActionPayloadSchema,
  chatMoodUpdatePayloadSchema,
  chatMoodLinkQuerySchema,
  chatMoodSendPayloadSchema,
  chatFeedbackPayloadSchema,
} from '#/features/chats/v1/chat.schema'

export type TChatFilterPayload = z.infer<typeof chatFilterPayloadSchema>
export type TChatCreatePayload = z.infer<typeof chatCreatePayloadSchema>
export type TChatResponse = z.infer<typeof chatResponseSchema>
export type TChatItemResponse = z.infer<typeof chatItemResponseSchema>
export type TChatSseEvent = z.infer<typeof chatSseEventSchema>
export type TChatActionPayload = z.infer<typeof chatActionPayloadSchema>
export type TChatMoodUpdatePayload = z.infer<typeof chatMoodUpdatePayloadSchema>
export type TChatMoodLinkQuery = z.infer<typeof chatMoodLinkQuerySchema>
export type TChatMoodSendPayload = z.infer<typeof chatMoodSendPayloadSchema>
export type TChatFeedbackPayload = z.infer<typeof chatFeedbackPayloadSchema>


export type TChatRawResponse = {
  id?: string
  user_id?: string
  sender_id?: string
  content?: TChatResponse['content']
  feedback?: 'like' | 'dislike' | null
  created_at?: Date | string
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  llm_credits?: number
  tool_credits?: number
  skill_credits?: number
  credits_used?: number
  tools?: Array<{ name: string; credits: number }>
  skills_used?: Array<{ name: string; overhead_credits: number; tool_count: number }>
  error?: { message: string; stage: string; code?: string } | null
}
