import { z } from 'zod'

export const summaryMonthlyPayloadSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

export const summaryMoodCountSchema = z.object({
  id: z.string(),
  count: z.number().int(),
})

export const summaryMonthlyResponseSchema = z.object({
  todo_count: z.number().int(),
  todo_completed: z.number().int(),
  schedule_count: z.number().int(),
  expense_count: z.number().int(),
  expense_total: z.number(),
  mood: z.array(summaryMoodCountSchema),
  highlight: z.array(z.string()),
  recommend: z.string(),
})
