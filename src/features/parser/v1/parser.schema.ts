import { z } from 'zod'

export const parserPayloadSchema = z.object({
  message: z.string().min(1, 'message is required'),
})

export const parserExpenseCategorySchema = z.enum([
  'food&drink',
  'transport',
  'shopping',
  'bills',
  'work',
  'other',
])

export const parserScheduleExtractSchema = z.object({
  type: z.enum(['calendar', 'reminder']),
  title: z.string(),
  scheduled_at: z.string(),
  end_at: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  invitees: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
})

export const parserExpenseExtractSchema = z.object({
  subject: z.string(),
  amount: z.number().min(0),
  category: parserExpenseCategorySchema,
  currency: z.string().default('THB'),
  location: z.string().optional().nullable(),
  date: z.string(),
  time: z.string().optional().nullable(),
})

export const parserTodoExtractSchema = z.object({
  title: z.string(),
  description: z.string().optional().nullable(),
})

export const parserExtractedSchema = z.object({
  schedule: parserScheduleExtractSchema.nullable(),
  expenses: z.array(parserExpenseExtractSchema).nullable(),
  todo: parserTodoExtractSchema.nullable(),
})

export const parserResponseSchema = z.object({
  meeting: z.number().min(0).max(1),
  reminder: z.number().min(0).max(1),
  expense: z.number().min(0).max(1),
  todo: z.number().min(0).max(1),
  extracted: parserExtractedSchema,
})
