import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'
import { dateTimeType } from '#/common/schemas/share.schema'

export const scheduleRepeatSchema = z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly'])
export const scheduleTypeSchema = z.enum(['calendar', 'reminder'])

export const scheduleCreatePayloadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  location: z.string().optional(),
  scheduled_at: z.string().datetime('scheduled_at must be a valid ISO datetime string'),
  end_at: z.string().datetime('end_at must be a valid ISO datetime string').optional(),
  invitees: z.string().optional(),
  repeat: scheduleRepeatSchema.optional(),
  note: z.string().optional(),
  type: scheduleTypeSchema.default('calendar'),
})

export const scheduleUpdatePayloadSchema = z.object({
  title: z.string().min(1, 'Title must not be empty').optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  scheduled_at: z.string().datetime('scheduled_at must be a valid ISO datetime string').optional(),
  end_at: z.string().datetime('end_at must be a valid ISO datetime string').optional(),
  invitees: z.string().optional(),
  repeat: scheduleRepeatSchema.optional(),
  note: z.string().optional(),
  type: scheduleTypeSchema.optional(),
})

export const scheduleResponseSchema = z.object({
  uuid: z.string(),
  userId: z.string(),
  type: scheduleTypeSchema,
  scheduled_at: z.string(),
  end_at: z.string().optional().nullable(),
  before_sent_at: z.string().optional().nullable(),
  sent_at: z.string().optional().nullable(),
  repeat: scheduleRepeatSchema.optional().nullable(),
  payload: z.object({
    message: z.string(),
    type: z.string(),
    title: z.string(),
    description: z.string().optional().nullable(),
    location: z.string().optional().nullable(),
    invitees: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
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
