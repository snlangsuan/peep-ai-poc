import type {
  moodCreatePayloadSchema,
  moodResponseSchema,
  moodFilterPayloadSchema,
  moodItemResponseSchema,
  emotionSchema,
} from '#/features/moods/v1/mood.schema'
import type { z } from 'zod'

export type TEmotion = z.infer<typeof emotionSchema>
export type TMoodCreatePayload = z.infer<typeof moodCreatePayloadSchema>
export type TMoodResponse = z.infer<typeof moodResponseSchema>
export type TMoodFilterPayload = z.infer<typeof moodFilterPayloadSchema>
export type TMoodItemResponse = z.infer<typeof moodItemResponseSchema>

export interface IMoodEntity {
  uuid: string
  user_id: string
  emotion: TEmotion
  note?: string | null
  date: string
  created_at: string
  updated_at: string
}
