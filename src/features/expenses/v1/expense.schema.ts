import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'
import { dateType, timeType } from '#/common/schemas/share.schema'

// Direction of a money record. Existing records (created before this field existed) are
// treated as 'expense' on read, so historical data stays correct without a migration.
export const expenseTypeSchema = z.enum(['income', 'expense'])

export const expenseCategorySchema = z.enum(['food&drink', 'transport', 'shopping', 'bills', 'work', 'other'])
export const incomeCategorySchema = z.enum(['salary', 'bonus', 'sale', 'transfer-in', 'refund', 'other-income'])

// A transaction category may belong to either direction; the tool/service is responsible for
// keeping `category` consistent with `type`.
export const transactionCategorySchema = z.union([expenseCategorySchema, incomeCategorySchema])

export const baseExpenseCreatePayloadItemSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  amount: z.number().min(0, 'Amount must be non-negative'),
  type: expenseTypeSchema.default('expense'),
  category: transactionCategorySchema,
  currency: z.string().default('THB'),
  location: z.string().optional().nullable(),
  date: dateType,
  time: timeType.optional().nullable(),
})

export const expenseCreatePayloadSchema = z.object({
  expenses: z.array(baseExpenseCreatePayloadItemSchema),
})

export const expenseUpdatePayloadSchema = z.object({
  subject: z.string().min(1, 'Subject must not be empty').optional(),
  amount: z.number().min(0, 'Amount must be non-negative').optional(),
  type: expenseTypeSchema.optional(),
  category: transactionCategorySchema.optional(),
  currency: z.string().optional(),
  location: z.string().optional().nullable(),
  date: dateType.optional(),
  time: timeType.optional().nullable(),
})

export const expenseResponseSchema = z.object({
  uuid: z.string(),
  created_by: z.string(),
  subject: z.string(),
  amount: z.number(),
  type: expenseTypeSchema,
  category: transactionCategorySchema,
  currency: z.string(),
  location: z.string().optional().nullable(),
  date: z.string(),
  time: z.string().optional().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const expenseFilterPayloadSchema = paginationFilterSchema.extend({
  start_date: dateType.optional(),
  end_date: dateType.optional(),
  sort: z.string().default('date'),
})

export const expenseItemResponseSchema = z.object({
  items: z.array(expenseResponseSchema),
  metadata: paginationMetadataSchema,
})

export const expenseParamPayloadSchema = z.object({
  id: z.uuid('Invalid UUID format'),
})
