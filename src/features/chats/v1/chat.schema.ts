import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'

export const chatFilterPayloadSchema = paginationFilterSchema.extend({
  sort: z.enum(['created_at']).default('created_at'),
  desc: z.boolean().default(true),
})

const baseChatMessageTextContentSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const baseChatMessageImageContentSchema = z.object({
  type: z.literal('image'),
  image_url: z.string(),
})

const baseChatMessageFileContentSchema = z.object({
  type: z.literal('file'),
  file_url: z.string(),
  file_name: z.string(),
})

const baseChatMessageLinkContentSchema = z.object({
  type: z.literal('link'),
  link: z.string(),
  title: z.string().optional(),
})

const baseChatMessageActionContentSchema = z.object({
  type: z.literal('action'),
  link: z.string(),
})

const baseChatMessageMoodCardContentSchema = z.object({
  type: z.literal('mood_card'),
  options: z.array(z.string()),
  selected_mood: z.string().nullable().optional(),
})

export const chatMessageInputContentSchema = z.discriminatedUnion('type', [
  baseChatMessageTextContentSchema,
  baseChatMessageImageContentSchema,
  baseChatMessageFileContentSchema,
  baseChatMessageLinkContentSchema,
])

export const chatMessageResponseContentSchema = z.discriminatedUnion('type', [
  baseChatMessageTextContentSchema,
  baseChatMessageImageContentSchema,
  baseChatMessageActionContentSchema,
  baseChatMessageMoodCardContentSchema,
])

export const chatCreatePayloadSchema = z.object({
  content: z.array(chatMessageInputContentSchema),
})

export const chatResponseSchema = z.object({
  id: z.string(),
  sender_id: z.string(),
  content: z.array(chatMessageResponseContentSchema),
  created_at: z.string(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  llm_credits: z.number().optional(),
  tool_credits: z.number().optional(),
  credits_used: z.number().optional(),
  tools: z
    .array(
      z.object({
        name: z.string(),
        credits: z.number(),
      }),
    )
    .optional(),
})

export const chatItemResponseSchema = z.object({
  items: z.array(chatResponseSchema),
  metadata: paginationMetadataSchema,
})

export const chatSseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queued'), job_id: z.string() }),
  z.object({ type: z.literal('thinking'), message: z.string().optional() }),
  z.object({ type: z.literal('calling_tool'), tool_name: z.string(), args: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('tool_response'), tool_name: z.string(), result: z.unknown() }),
  z.object({
    type: z.literal('done'),
    response: z.string(),
    metadata: z.object({
      total_input_tokens: z.number(),
      total_output_tokens: z.number(),
      grand_total_tokens: z.number(),
      tool_usage_count: z.number(),
      total_credits_used: z.number(),
      remaining_credits: z.number().optional(),
    }),
  }),
  z.object({ type: z.literal('error'), message: z.string() }),
])

export const chatActionPayloadSchema = z.object({
  action: z.enum(['expense', 'schedule', 'todo', 'mood', 'summary', 'fortune-telling']),
})

export const chatMoodUpdatePayloadSchema = z.object({
  messageId: z.string(),
  mood: z.string(),
})



