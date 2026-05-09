import { z } from 'zod'

import type {
  createExpenseSchema,
  expenseIdParamSchema,
  expenseListFilterSchema,
  expenseListResponseSchema,
  expenseResponseSchema,
  updateExpenseSchema,
} from '#/features/expenses/v1/expense.schema'

export type TCreateExpense = z.infer<typeof createExpenseSchema>
export type TUpdateExpense = z.infer<typeof updateExpenseSchema>
export type TExpenseResponse = z.infer<typeof expenseResponseSchema>
export type TExpenseListResponse = z.infer<typeof expenseListResponseSchema>
export type TExpenseListFilter = z.infer<typeof expenseListFilterSchema>
export type TExpenseIdParam = z.infer<typeof expenseIdParamSchema>
