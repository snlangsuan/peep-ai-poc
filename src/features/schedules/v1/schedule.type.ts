import type {
  scheduleCreatePayloadSchema,
  scheduleUpdatePayloadSchema,
  scheduleResponseSchema,
  scheduleFilterPayloadSchema,
  scheduleItemResponseSchema,
  scheduleParamPayloadSchema,
} from '#/features/schedules/v1/schedule.schema'
import type { z } from 'zod'

export type TScheduleCreatePayload = z.infer<typeof scheduleCreatePayloadSchema>
export type TScheduleUpdatePayload = z.infer<typeof scheduleUpdatePayloadSchema>
export type TScheduleResponse = z.infer<typeof scheduleResponseSchema>
export type TScheduleFilterPayload = z.infer<typeof scheduleFilterPayloadSchema>
export type TScheduleItemResponse = z.infer<typeof scheduleItemResponseSchema>
export type TScheduleParamPayload = z.infer<typeof scheduleParamPayloadSchema>

export type TScheduleCreateInput = {
  uuid: string
  user_id: string
  scheduled_at: string
  before_sent_at?: string | null
  sent_at?: string | null
  payload: {
    message: string
    type: string
    title: string
    description?: string | null
    location?: string | null
  }
  created_at: string
  updated_at: string
}
