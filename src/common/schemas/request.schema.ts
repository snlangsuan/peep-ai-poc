import { z } from 'zod'

export const paginationFilterDescType = z
  .enum(['true', 'false'])
  .transform((x) => x === 'true')
  .pipe(z.boolean())

export const paginationFilterOffsetSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(25),
})

export const paginationFilterOrderSchema = z.object({
  sort: z.string().default('id'),
  desc: paginationFilterDescType.default(true),
})

export const paginationFilterSchema = z.object({
  ...paginationFilterOffsetSchema.shape,
  ...paginationFilterOrderSchema.shape,
})

export const dateFilterType = z
  .string()
  .regex(/\d{4}-\d{2}-\d{2}/)
  .meta({ example: '2026-04-25' })
export const dateTimeFilterType = z
  .string()
  .regex(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)
  .meta({ example: '2026-04-25 10:37:44' })
