import { paginationFilterSchema } from '#/common/schemas/request.schema'
import { z } from 'zod'
import { paginationMetadataSchema } from '#/common/schemas/response.schema'
import { dateTimeType, dateType } from '#/common/schemas/share.schema'
import dayjs from 'dayjs'
import { getLocalTime } from '~/src/common/utils/datetime.util'

export const sendMessageSchema = z.object({
  message: z.string().describe('The content of the message.'),
})

export const chatResponseSchema = z.object({
  id: z.string(),
})

export const chatResponseWithContentSchema = chatResponseSchema.extend({
  message: z.string(),
  sender_id: z.string(),
  created_at: z.date().or(z.string()),
  credits: z.number().optional(),
})

export const chatListResponseSchema = z.object({
  metadata: paginationMetadataSchema,
  items: z.array(chatResponseWithContentSchema).default([]),
})

export const chatListFilterSchema = paginationFilterSchema.extend({})

export const chatStreamFilterSchema = z.object({})

export const chatActionRequestBodyPayloadSchema = z.object({
  start_date: dateType
    .describe('The start date of the period. format: YYYY-MM-DD')
    .default(getLocalTime().startOf('day').format('YYYY-MM-DD')),
  end_date: dateType
    .describe('The end date of the period. format: YYYY-MM-DD')
    .default(getLocalTime().endOf('day').format('YYYY-MM-DD')),
})
