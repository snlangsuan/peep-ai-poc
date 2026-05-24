import type {
  todoCreatePayloadSchema,
  todoUpdatePayloadSchema,
  todoResponseSchema,
  todoFilterPayloadSchema,
  todoItemResponseSchema,
  todoParamPayloadSchema,
} from '#/features/todos/v1/todo.schema'
import type { z } from 'zod'

export type TTodoCreatePayload = z.infer<typeof todoCreatePayloadSchema>
export type TTodoUpdatePayload = z.infer<typeof todoUpdatePayloadSchema>
export type TTodoResponse = z.infer<typeof todoResponseSchema>
export type TTodoFilterPayload = z.infer<typeof todoFilterPayloadSchema>
export type TTodoItemResponse = z.infer<typeof todoItemResponseSchema>
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
