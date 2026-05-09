import { z } from 'zod'

import type {
  createScheduleSchema,
  scheduleIdParamSchema,
  scheduleListFilterSchema,
  scheduleListResponseSchema,
  scheduleResponseSchema,
  updateScheduleSchema,
} from '#/features/schedules/v1/schedule.schema'

export type TCreateSchedule = z.infer<typeof createScheduleSchema>
export type TUpdateSchedule = z.infer<typeof updateScheduleSchema>
export type TScheduleResponse = z.infer<typeof scheduleResponseSchema>
export type TScheduleListResponse = z.infer<typeof scheduleListResponseSchema>
export type TScheduleListFilter = z.infer<typeof scheduleListFilterSchema>
export type TScheduleIdParam = z.infer<typeof scheduleIdParamSchema>
