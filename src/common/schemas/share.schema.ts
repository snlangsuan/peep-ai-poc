import { z } from 'zod'

export const dateType = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/).describe('The date of the message.')

export const timeType = z.string().regex(/^[0-9]{2}:[0-9]{2}$/).describe('The time of the message.')

export const dateTimeType = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$/).describe('The date and time of the message.')
