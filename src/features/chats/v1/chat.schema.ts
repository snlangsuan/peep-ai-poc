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
  title: z.string(),
  options: z.array(
    z.object({
      id: z.enum(['great', 'good', 'okay', 'low', 'bad']),
      link: z.string(),
    }),
  ),
})

const baseChatMessageMoodResultContentSchema = z.object({
  type: z.literal('mood_result'),
  title: z.string(),
  created_at: z.string(),
  mood: z.enum(['great', 'good', 'okay', 'low', 'bad']),
  note: z.string().optional().nullable(),
  message: z.string(),
})

const baseChatMessageScheduleContentSchema = z.object({
  type: z.literal('schedule'),
  title: z.string(),
  subtitle: z.string(),
  created_at: z.string(),
  items: z.array(
    z.object({
      uuid: z.string(),
      title: z.string(),
      scheduled_at: z.string(),
      created_at: z.string(),
    }),
  ),
})

const baseChatMessageExpenseContentSchema = z.object({
  type: z.literal('expense'),
  title: z.string(),
  subtitle: z.string(),
  created_at: z.string(),
  items: z.array(
    z.object({
      uuid: z.string(),
      subject: z.string(),
      amount: z.number(),
      category: z.enum(['food&drink', 'transport', 'shopping', 'bills', 'work', 'other']),
      date: z.string(),
      created_at: z.string(),
    }),
  ),
  total: z.number(),
})

const baseChatMessageTodoContentSchema = z.object({
  type: z.literal('todo'),
  title: z.string(),
  subtitle: z.string(),
  created_at: z.string(),
  items: z.array(
    z.object({
      uuid: z.string(),
      title: z.string(),
      completed: z.boolean(),
      created_at: z.string(),
    }),
  ),
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
  baseChatMessageMoodResultContentSchema,
  baseChatMessageScheduleContentSchema,
  baseChatMessageExpenseContentSchema,
  baseChatMessageTodoContentSchema,
])

export const chatCreatePayloadSchema = z.object({
  content: z.array(chatMessageInputContentSchema),
})

export const chatResponseSchema = z.object({
  id: z.string(),
  sender_id: z.string(),
  content: z.array(chatMessageResponseContentSchema),
  created_at: z.string(),
  feedback: z.enum(['like', 'dislike']).nullable().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  llm_credits: z.number().int().optional(),
  tool_credits: z.number().int().optional(),
  skill_credits: z.number().int().optional(),
  credits_used: z.number().int().optional(),
  tools: z
    .array(
      z.object({
        name: z.string(),
        credits: z.number(),
      }),
    )
    .optional(),
  skills_used: z
    .array(
      z.object({
        name: z.string(),
        overhead_credits: z.number(),
        tool_count: z.number(),
      }),
    )
    .optional(),
  error: z
    .preprocess(
      (val) => {
        if (val == null) return val
        if (typeof val === 'string') return { message: val, stage: 'unknown' }
        return val
      },
      z
        .object({
          message: z.string(),
          stage: z.string(),
          code: z.string().optional(),
        })
        .nullable()
        .optional(),
    )
    .optional(),
})

export const chatItemResponseSchema = z.object({
  items: z.array(chatResponseSchema),
  metadata: paginationMetadataSchema,
})

export const chatSseEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('queued'), job_id: z.string() }),
  z.object({ type: z.literal('user_message'), message: chatResponseSchema }),
  z.object({ type: z.literal('bot_message'), message: chatResponseSchema }),
  z.object({ type: z.literal('thinking'), message: z.string().optional() }),
  z.object({ type: z.literal('calling_tool'), tool_name: z.string(), args: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('tool_response'), tool_name: z.string(), result: z.unknown() }),
  z.object({
    type: z.literal('done'),
    message: chatResponseSchema,
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    message_id: z.string().optional(),
    stage: z.string().optional(),
    code: z.string().optional(),
    bot_message_id: z.string().optional(),
  }),
])

export const chatActionPayloadSchema = z.object({
  action: z.enum(['expense', 'schedule', 'todo', 'mood', 'summary', 'fortune-telling']),
})

export const chatMoodUpdatePayloadSchema = z.object({
  messageId: z.string(),
  mood: z.string(),
})

export const chatMoodLinkQuerySchema = z.object({
  option: z.enum(['great', 'good', 'okay', 'low', 'bad']),
  sid: z.string().min(1),
})

export const chatMoodSendPayloadSchema = z.object({
  to: z.array(z.string().min(1)).min(1),
})

export const chatFeedbackPayloadSchema = z.object({
  messageId: z.string(),
  feedback: z.enum(['like', 'dislike']).nullable(),
})



