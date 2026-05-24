import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'

export const todoCreatePayloadSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
})

export const todoUpdatePayloadSchema = z.object({
  title: z.string().min(1, 'Title must not be empty').optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
})

export const todoResponseSchema = z.object({
  uuid: z.string(),
  user_id: z.string(),
  title: z.string(),
  description: z.string().optional().nullable(),
  completed: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const todoFilterPayloadSchema = paginationFilterSchema.extend({
  completed: z
    .enum(['true', 'false'])
    .transform((x) => x === 'true')
    .pipe(z.boolean())
    .optional(),
  sort: z.string().default('created_at'),
})

export const todoItemResponseSchema = z.object({
  items: z.array(todoResponseSchema),
  metadata: paginationMetadataSchema,
})

export const todoParamPayloadSchema = z.object({
  id: z.uuid('Invalid UUID format'),
})
