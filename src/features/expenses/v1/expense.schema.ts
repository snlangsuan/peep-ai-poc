import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { z } from 'zod'
import { paginationMetadataSchema } from '~/src/common/schemas/response.schema'
import { dateType } from '~/src/common/schemas/share.schema'

export const createExpenseSchema = z.object({
  subject: z.string().describe('The subject of the expense.'),
  amount: z.number().describe('The amount of the expense.'),
  currency: z.string().default('THB').describe('The currency of the expense.'),
  location: z.string().optional().describe('The location of the expense.'),
  date: z.string().describe('The date of the expense (YYYY-MM-DD).'),
  time: z.string().optional().describe('The time of the expense (HH:mm).'),
})

export const expenseResponseSchema = z.object({
  id: z.string(),
  subject: z.string(),
  amount: z.number(),
  currency: z.string(),
  location: z.string().nullish(),
  date: z.date().or(z.string()),
  time: z.string().nullish(),
  created_at: z.date().or(z.string()),
  updated_at: z.date().or(z.string()),
})

export const expenseListResponseSchema = z.object({
  metadata: paginationMetadataSchema,
  items: z.array(expenseResponseSchema),
})

export const expenseListFilterSchema = paginationFilterSchema.extend({
  sort: z
    .enum(['created_at', 'date', 'amount'] as const)
    .default('created_at')
    .optional(),
  start_date: dateType.optional().describe('The start date for filtering (YYYY-MM-DD).'),
  end_date: dateType.optional().describe('The end date for filtering (YYYY-MM-DD).'),
})

export const updateExpenseSchema = createExpenseSchema.partial()

export const expenseIdParamSchema = z.object({
  id: z.string().describe('The ID of the expense.'),
})
