import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'
import { dateType } from '#/common/schemas/share.schema'

export const emotionSchema = z.enum(['great', 'good', 'okay', 'low', 'bad'])

export const moodCreatePayloadSchema = z.object({
  emotion: emotionSchema,
  note: z.string().optional().nullable(),
  // Optional mood-card session id. When provided, the server verifies the card
  // has not been used yet (one mood per card) before saving.
  sid: z.string().optional(),
})

export const moodResponseSchema = z.object({
  uuid: z.string(),
  user_id: z.string(),
  emotion: emotionSchema,
  note: z.string().optional().nullable(),
  date: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const moodFilterPayloadSchema = paginationFilterSchema.extend({
  start_date: dateType.optional(),
  end_date: dateType.optional(),
  emotion: emotionSchema.optional(),
  sort: z.string().default('date'),
})

export const moodItemResponseSchema = z.object({
  items: z.array(moodResponseSchema),
  metadata: paginationMetadataSchema,
})
