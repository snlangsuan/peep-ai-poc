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
      end_at: z.string().nullable().optional(),
      created_at: z.string(),
      // True when the card should also render an invite (single appointment with someone).
      // Optional + default keeps older stored cards (without this field) parseable.
      invite: z.boolean().optional().default(false),
    }),
  ),
  // Actual total number of items (items[] may be truncated for display).
  item_count: z.number().optional(),
})

const baseChatMessageScheduleNotifyContentSchema = z.object({
  type: z.literal('schedule_notify'),
  title: z.string(),
  subtitle: z.string(),
  created_at: z.string(),
  items: z.array(
    z.object({
      uuid: z.string(),
      title: z.string(),
      schedule_at: z.string(),
      end_at: z.string().nullable().optional(),
      created_at: z.string(),
      // Present only when the schedule carries a note.
      note: z.string().nullable().optional(),
    }),
  ),
  // Actual total number of items (items[] may be truncated for display).
  item_count: z.number().optional(),
  // Minutes ahead of the schedule when this is an advance reminder.
  // Present only for pre-notifications; absent when the appointment is due now.
  notify_before_minutes: z.number().optional(),
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
      // Direction of the record. Optional + default keeps older stored cards parseable.
      kind: z.enum(['income', 'expense']).optional().default('expense'),
      category: z.enum([
        'food&drink',
        'transport',
        'shopping',
        'bills',
        'work',
        'other',
        'salary',
        'bonus',
        'sale',
        'transfer-in',
        'refund',
        'other-income',
      ]),
      date: z.string(),
      created_at: z.string(),
    }),
  ),
  // Net total (income − expense) of the listed records. Kept named `total` for backward compat.
  total: z.number(),
  // Direction-split totals; optional so older stored cards stay parseable.
  income_total: z.number().optional(),
  expense_total: z.number().optional(),
  // Actual total number of items (items[] may be truncated for display).
  item_count: z.number().optional(),
})

const baseChatMessageExpenseSummaryContentSchema = z.object({
  type: z.literal('expense_summary'),
  // Net total (income − expense) for the period. Kept named `total` for backward compat.
  total: z.number(),
  income_total: z.number().optional(),
  expense_total: z.number().optional(),
  net_total: z.number().optional(),
  start_date: z.string(),
  end_date: z.string(),
  // expense category name -> summed amount for that category within the period.
  summary: z.record(z.string(), z.number()),
  // income category name -> summed amount within the period.
  income_summary: z.record(z.string(), z.number()).optional(),
})

const baseChatMessageBalanceContentSchema = z.object({
  type: z.literal('balance'),
  created_at: z.string(),
  // The month this balance describes, 'YYYY-MM'.
  month: z.string(),
  // Money carried in from the previous month (or the user-set opening balance).
  opening_balance: z.number(),
  income_total: z.number(),
  expense_total: z.number(),
  // income_total − expense_total for the month.
  net_total: z.number(),
  // opening_balance + net_total. This flows into next month's opening_balance.
  closing_balance: z.number(),
  // True when the opening balance was set manually for this month rather than carried over.
  opening_is_override: z.boolean().optional(),
  currency: z.string().optional().default('THB'),
  // Optional monthly spending cap (budget layer).
  budget: z.number().nullable().optional(),
  // expense_total / budget as a 0..1+ ratio; present only when a budget is set.
  budget_used_ratio: z.number().nullable().optional(),
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
  // Actual total number of items (items[] may be truncated for display).
  item_count: z.number().optional(),
})

export const chatMessageInputContentSchema = z.discriminatedUnion('type', [
  baseChatMessageTextContentSchema,
  baseChatMessageImageContentSchema,
  baseChatMessageFileContentSchema,
  baseChatMessageLinkContentSchema,
])

const chatFortuneAspectSchema = z.object({
  reading: z.string(),
  caution: z.string().optional(),
})

const baseChatMessageFortuneContentSchema = z.object({
  type: z.literal('fortune-telling'),
  created_at: z.string(),
  date: z.string(),
  sign_name: z.string(),
  sign_key: z.string(),
  date_range: z.string(),
  tagline: z.string(),
  work: chatFortuneAspectSchema,
  love: chatFortuneAspectSchema,
  finance: chatFortuneAspectSchema,
  lucky_numbers: z.array(z.number()),
  lucky_color: z.string(),
  lucky_time: z.string(),
  energy_level: z.number(),
  energy: z.string(),
})

const baseChatMessageMonthlySummaryContentSchema = z.object({
  type: z.literal('monthly-summary'),
  created_at: z.string(),
  // Language-agnostic period keyword (today | 7d | 30d | this_week | this_month | custom | ...).
  period: z.string().optional(),
  // month/year only meaningful for a full-month period; optional otherwise.
  month: z.string().optional(),
  year: z.string().optional(),
  // Period bounds the data was aggregated over (YYYY-MM-DD).
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  title: z.string(),
  content: z.object({
    // Period keyword + bounds (present on new cards; mirror of the envelope).
    period: z.string().optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    todo_count: z.number(),
    todo_completed: z.number(),
    schedule_count: z.number(),
    expense_count: z.number(),
    expense_total: z.number(),
    // Accounting fields; optional so older stored summary cards stay parseable.
    // opening/closing are null for non-month periods.
    income_total: z.number().optional(),
    net_total: z.number().optional(),
    opening_balance: z.number().nullable().optional(),
    closing_balance: z.number().nullable().optional(),
    budget: z.number().nullable().optional(),
    mood: z.array(z.object({ id: z.string(), count: z.number() })),
    highlight: z.array(z.string()),
    recommend: z.string(),
  }),
})

export const chatMessageResponseContentSchema = z.discriminatedUnion('type', [
  baseChatMessageTextContentSchema,
  baseChatMessageImageContentSchema,
  baseChatMessageActionContentSchema,
  baseChatMessageMoodCardContentSchema,
  baseChatMessageMoodResultContentSchema,
  baseChatMessageScheduleContentSchema,
  baseChatMessageScheduleNotifyContentSchema,
  baseChatMessageExpenseContentSchema,
  baseChatMessageExpenseSummaryContentSchema,
  baseChatMessageBalanceContentSchema,
  baseChatMessageTodoContentSchema,
  baseChatMessageFortuneContentSchema,
  baseChatMessageMonthlySummaryContentSchema,
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
  z.object({ type: z.literal('session_cleared'), session_id: z.string() }),
  // Transient toast notification — shown to the user but NOT persisted to chat history.
  z.object({
    type: z.literal('toast'),
    message: z.string(),
    // Optional tappable quick replies; tapping a "message" action sends `text` as a user message.
    quick_reply: z
      .array(
        z.object({
          type: z.literal('action'),
          action: z.object({
            type: z.literal('message'),
            label: z.string(),
            text: z.string(),
          }),
        }),
      )
      .optional(),
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
