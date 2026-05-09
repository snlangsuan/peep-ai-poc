import { z } from 'zod'
import { dateTimeType, dateType, timeType } from '~/src/common/schemas/share.schema'

export const extractMessageItemResponseSchema = z.object({
  type: z.enum(['expense', 'schedule']).describe('The type of the message.'),
  amount: z.number().optional().describe('The amount of the message.'),
  subject: z.string().optional().describe('The subject of the message.'),
  currency: z.string().optional().describe('The currency of the message.'),
  location: z.string().optional().describe('The location of the message.'),
  category: z.string().optional().describe('The category of the expense (e.g., Food, Travel).'),
  date: dateType.optional().describe('The date of the message.'),
  time: timeType.optional().describe('The time of the message.'),
  confidence: z.number().min(0).max(1).describe('The confidence score of the extraction (0 to 1).'),
})

export const extractMessageResponseSchema = z.object({
  items: z.array(extractMessageItemResponseSchema).describe('The extracted items from the message.'),
})

export const extractMessageRequestBodyPayloadSchema = z.object({
  message: z.string().describe('The message to extract information from.'),
  date: dateTimeType.describe('The date and time when the message was created.'),
})
