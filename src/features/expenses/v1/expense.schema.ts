import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'
import { dateType, timeType } from '#/common/schemas/share.schema'

export const expenseCategorySchema = z.enum(['food&drink', 'transport', 'shopping', 'bills', 'work', 'other'])

export const baseExpenseCreatePayloadItemSchema = z.object({
  subject: z.string().min(1, 'Subject is required'),
  amount: z.number().min(0, 'Amount must be non-negative'),
  category: expenseCategorySchema,
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
  category: expenseCategorySchema.optional(),
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
  category: expenseCategorySchema,
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
