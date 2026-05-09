import { paginationFilterDescType, paginationFilterSchema } from '#/common/schemas/request.schema'
import { z } from 'zod'
import { dateTimeType, dateType } from '#/common/schemas/share.schema'
import { paginationMetadataSchema } from '~/src/common/schemas/response.schema'

export const createScheduleSchema = z.object({
  title: z.string().describe('The title of the schedule.'),
  location: z.string().optional().describe('The location of the schedule.'),
  date: z.string().describe('The date of the schedule (YYYY-MM-DD).'),
  time: z.string().optional().describe('The time of the schedule (HH:mm).'),
  description: z.string().optional().describe('Optional description of the schedule.'),
  remind_before_minutes: z.number().int().min(0).default(10).describe('Minutes before the schedule to be reminded.'),
})

export const scheduleResponseSchema = z.object({
  id: z.string(),
  created_by: z.string(),
  title: z.string(),
  location: z.string().nullish(),
  date: z.date().or(z.string()),
  time: z.string().nullish(),
  scheduled_at: z.date().or(z.string()),
  remind_at: z.date().or(z.string()).nullish(),
  description: z.string().nullish(),
  created_at: z.date().or(z.string()),
  updated_at: z.date().or(z.string()),
  remind_before_minutes: z.number().default(10),
  notified: z.boolean().default(false),
})

export const scheduleListResponseSchema = z.object({
  metadata: paginationMetadataSchema,
  items: z.array(scheduleResponseSchema),
})

export const scheduleListFilterSchema = paginationFilterSchema.extend({
  sort: z.enum(['created_at', 'date', 'time', 'scheduled_at']).default('scheduled_at').optional(),
  desc: paginationFilterDescType.default(false).optional(),
  start_date: dateTimeType.optional().describe('The start date and time for filtering (YYYY-MM-DD HH:mm).'),
  end_date: dateTimeType.optional().describe('The end date and time for filtering (YYYY-MM-DD HH:mm).'),
})

export const updateScheduleSchema = createScheduleSchema.partial()

export const scheduleIdParamSchema = z.object({
  id: z.string().describe('The ID of the schedule.'),
})
