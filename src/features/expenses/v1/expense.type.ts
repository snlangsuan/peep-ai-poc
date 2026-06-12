import type {
  expenseCreatePayloadSchema,
  baseExpenseCreatePayloadItemSchema,
  expenseUpdatePayloadSchema,
  expenseResponseSchema,
  expenseFilterPayloadSchema,
  expenseItemResponseSchema,
  expenseParamPayloadSchema,
  transactionCategorySchema,
  expenseTypeSchema,
} from '#/features/expenses/v1/expense.schema'
import type { z } from 'zod'

export type TExpenseCreatePayload = z.infer<typeof expenseCreatePayloadSchema>
export type TExpenseCreatePayloadItem = z.infer<typeof baseExpenseCreatePayloadItemSchema>
export type TExpenseUpdatePayload = z.infer<typeof expenseUpdatePayloadSchema>
export type TExpenseResponse = z.infer<typeof expenseResponseSchema>
export type TExpenseFilterPayload = z.infer<typeof expenseFilterPayloadSchema>
export type TExpenseItemResponse = z.infer<typeof expenseItemResponseSchema>
export type TExpenseParamPayload = z.infer<typeof expenseParamPayloadSchema>

export type TExpenseType = z.infer<typeof expenseTypeSchema>
export type TTransactionCategory = z.infer<typeof transactionCategorySchema>

export interface IExpenseEntity {
  uuid: string
  created_by: string
  subject: string
  amount: number
  type: TExpenseType
  category: TTransactionCategory
  currency: string
  location?: string | null
  date: string
  time?: string | null
  created_at: string
  updated_at: string
}
