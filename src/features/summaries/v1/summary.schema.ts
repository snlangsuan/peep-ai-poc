import { z } from 'zod'

import { dateType } from '#/common/schemas/share.schema'
import { isRangeTooLong, SUMMARY_MAX_RANGE_DAYS, SUMMARY_NAMED_PERIODS } from '#/features/summaries/v1/summary.period'

export const summaryMonthlyPayloadSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
})

// Either a named `period` OR an explicit `start_date`+`end_date` range.
// Defaults to the current month when nothing is given.
export const summaryPeriodPayloadSchema = z
  .object({
    period: z.enum(SUMMARY_NAMED_PERIODS).optional(),
    start_date: dateType.optional(),
    end_date: dateType.optional(),
  })
  .refine((v) => (v.start_date ? !!v.end_date : !v.end_date), {
    message: 'start_date and end_date must be provided together',
    path: ['end_date'],
  })
  .refine((v) => !(v.start_date && v.end_date) || !isRangeTooLong(v.start_date, v.end_date), {
    message: `date range must not exceed ${SUMMARY_MAX_RANGE_DAYS} days (1 year)`,
    path: ['end_date'],
  })

export const summaryMoodCountSchema = z.object({
  id: z.string(),
  count: z.number().int(),
})

export const summaryMonthlyResponseSchema = z.object({
  // Language-agnostic period keyword — the client localizes it (no Thai text sent).
  period: z.enum([...SUMMARY_NAMED_PERIODS, 'custom']),
  // Inclusive local date bounds the data was aggregated over (YYYY-MM-DD).
  start_date: z.string(),
  end_date: z.string(),
  todo_count: z.number().int(),
  todo_completed: z.number().int(),
  schedule_count: z.number().int(),
  expense_count: z.number().int(),
  // Total spent (expense-type only) within the period.
  expense_total: z.number(),
  // Total received (income-type) within the period.
  income_total: z.number(),
  // income_total − expense_total.
  net_total: z.number(),
  // Accounting carry-over — only meaningful for a full calendar month; null otherwise.
  opening_balance: z.number().nullable(),
  closing_balance: z.number().nullable(),
  // Monthly budget cap; null when unset or for non-month periods.
  budget: z.number().nullable(),
  mood: z.array(summaryMoodCountSchema),
  highlight: z.array(z.string()),
  recommend: z.string(),
})
