import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'
import { dateTimeType } from '#/common/schemas/share.schema'

export const scheduleCreatePayloadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  scheduled_at: z.string().datetime('scheduled_at must be a valid ISO datetime string'),
})

export const scheduleUpdatePayloadSchema = z.object({
  title: z.string().min(1, 'Title must not be empty').optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  scheduled_at: z.string().datetime('scheduled_at must be a valid ISO datetime string').optional(),
})

export const scheduleResponseSchema = z.object({
  uuid: z.string(),
  userId: z.string(),
  scheduled_at: z.string(),
  before_sent_at: z.string().optional().nullable(),
  sent_at: z.string().optional().nullable(),
  payload: z.object({
    message: z.string(),
    type: z.string(),
    title: z.string(),
    description: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const scheduleFilterPayloadSchema = paginationFilterSchema.extend({
  start_date: dateTimeType.optional(),
  end_date: dateTimeType.optional(),
  sort: z.string().default('scheduled_at'),
})

export const scheduleItemResponseSchema = z.object({
  items: z.array(scheduleResponseSchema),
  metadata: paginationMetadataSchema,
})

export const scheduleParamPayloadSchema = z.object({
  id: z.uuid('Invalid UUID format'),
})
