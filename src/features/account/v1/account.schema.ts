import { z } from 'zod'

// A calendar month in 'YYYY-MM' form (the unit accounting rolls over on).
export const monthType = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be in YYYY-MM format')

export const accountMonthResponseSchema = z.object({
  month: monthType,
  // Money carried in from the previous month, or the user-set opening balance for this month.
  opening_balance: z.number(),
  // True when opening_balance came from a manual override rather than auto carry-over.
  opening_is_override: z.boolean(),
  income_total: z.number(),
  expense_total: z.number(),
  // income_total − expense_total for the month.
  net_total: z.number(),
  // opening_balance + net_total. Flows into next month's opening_balance.
  closing_balance: z.number(),
  currency: z.string().default('THB'),
  // Optional monthly spending cap (budget layer); null when not set.
  budget: z.number().nullable(),
  // Amount spent against the budget this month (= expense_total).
  budget_used: z.number(),
  // budget − expense_total; null when no budget is set.
  budget_remaining: z.number().nullable(),
  // expense_total / budget (0..1+); null when no budget is set.
  budget_used_ratio: z.number().nullable(),
})

export const setOpeningBalancePayloadSchema = z.object({
  month: monthType,
  opening_balance: z.number(),
})

export const setBudgetPayloadSchema = z.object({
  month: monthType,
  // null clears the budget for the month.
  budget: z.number().min(0, 'Budget must be non-negative').nullable(),
})

export const balanceQuerySchema = z.object({
  // Defaults to the current month when omitted.
  month: monthType.optional(),
})
