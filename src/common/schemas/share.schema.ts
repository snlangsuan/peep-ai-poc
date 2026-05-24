import { z } from 'zod'

export const dateType = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'Date must be in YYYY-MM-DD format')
  .describe('The date of the message.')

export const timeType = z
  .string()
  .regex(/^[0-9]{2}:[0-9]{2}$/, 'Time must be in HH:MM format')
  .describe('The time of the message.')

export const dateTimeType = z
  .string()
  .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$/, 'Date and time must be in YYYY-MM-DD HH:MM format')
  .describe('The date and time of the message.')
