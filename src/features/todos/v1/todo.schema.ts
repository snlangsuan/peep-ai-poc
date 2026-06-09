import { z } from 'zod'

import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'

export const todoCreateItemSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
})

// Create always takes a `todos` array (1..50 items). A single todo is just an
// array of length 1 — there are no top-level title/description fields.
export const todoCreatePayloadSchema = z.object({
  todos: z
    .array(todoCreateItemSchema)
    .min(1, 'todos must not be empty')
    .max(50, 'Cannot create more than 50 todos at once'),
})

// The mutable fields of a todo — used by the service layer and the chat tool.
export const todoUpdateFieldsSchema = z.object({
  title: z.string().min(1, 'Title must not be empty').optional(),
  description: z.string().optional(),
  completed: z.boolean().optional(),
})

// A single item in a batch update: the mutable fields plus the target `uuid`.
export const todoUpdateItemSchema = todoUpdateFieldsSchema.extend({
  uuid: z.uuid('Invalid UUID format'),
})

// Update always takes a `todos` array (1..50 items), each carrying its own uuid.
export const todoUpdatePayloadSchema = z.object({
  todos: z
    .array(todoUpdateItemSchema)
    .min(1, 'todos must not be empty')
    .max(50, 'Cannot update more than 50 todos at once'),
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

export const todoBatchResponseSchema = z.object({
  items: z.array(todoResponseSchema),
})

export const todoParamPayloadSchema = z.object({
  id: z.uuid('Invalid UUID format'),
})
