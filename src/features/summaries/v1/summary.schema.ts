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
  // Total spent (expense-type only) this month.
  expense_total: z.number(),
  // Total received (income-type) this month.
  income_total: z.number(),
  // income_total − expense_total.
  net_total: z.number(),
  // Balance carried in from the previous month (or the manual override).
  opening_balance: z.number(),
  // opening_balance + net_total; flows into next month.
  closing_balance: z.number(),
  // Monthly budget cap; null when unset.
  budget: z.number().nullable(),
  mood: z.array(summaryMoodCountSchema),
  highlight: z.array(z.string()),
  recommend: z.string(),
})
