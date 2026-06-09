import type {
  todoCreatePayloadSchema,
  todoCreateItemSchema,
  todoUpdatePayloadSchema,
  todoUpdateFieldsSchema,
  todoUpdateItemSchema,
  todoResponseSchema,
  todoFilterPayloadSchema,
  todoItemResponseSchema,
  todoBatchResponseSchema,
  todoParamPayloadSchema,
} from '#/features/todos/v1/todo.schema'
import type { z } from 'zod'

export type TTodoCreatePayload = z.infer<typeof todoCreatePayloadSchema>
export type TTodoCreateItem = z.infer<typeof todoCreateItemSchema>
export type TTodoUpdatePayload = z.infer<typeof todoUpdatePayloadSchema>
export type TTodoUpdateFields = z.infer<typeof todoUpdateFieldsSchema>
export type TTodoUpdateItem = z.infer<typeof todoUpdateItemSchema>
export type TTodoResponse = z.infer<typeof todoResponseSchema>
export type TTodoFilterPayload = z.infer<typeof todoFilterPayloadSchema>
export type TTodoItemResponse = z.infer<typeof todoItemResponseSchema>
export type TTodoBatchResponse = z.infer<typeof todoBatchResponseSchema>
export type TTodoParamPayload = z.infer<typeof todoParamPayloadSchema>

export interface ITodoCreateInput {
  uuid: string
  user_id: string
  title: string
  description?: string | null
  completed: boolean
  created_at: string
  updated_at: string
}
