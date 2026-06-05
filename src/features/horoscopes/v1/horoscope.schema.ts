import { z } from 'zod'

import { dateType } from '#/common/schemas/share.schema'
import { ZODIAC_SIGNS } from '#/features/horoscopes/v1/horoscope.constant'

const zodiacSignKeys = ZODIAC_SIGNS.map((s) => s.key) as [string, ...string[]]
export const zodiacSignEnum = z.enum(zodiacSignKeys)

/** A fortune aspect: the reading plus an optional "things to watch out for". */
export const horoscopeAspectSchema = z.object({
  reading: z.string(),
  caution: z.string().optional(),
})

export const horoscopeResponseSchema = z.object({
  date: z.string(),
  sign_key: z.string(),
  sign: z.string(),
  date_range: z.string(),
  tagline: z.string(),
  lucky_numbers: z.array(z.string()),
  lucky_color: z.string(),
  lucky_time: z.string(),
  love: horoscopeAspectSchema,
  finance: horoscopeAspectSchema,
  work: horoscopeAspectSchema,
  energy: z.string(),
  energy_level: z.number(),
})

export const horoscopeFilterPayloadSchema = z.object({
  // The prediction date (YYYY-MM-DD). Defaults to today (Asia/Bangkok) when omitted.
  date: dateType.optional(),
  // Optional zodiac sign key to fetch a single sign (e.g. "leo").
  sign: zodiacSignEnum.optional(),
})

export const horoscopeItemResponseSchema = z.object({
  items: z.array(horoscopeResponseSchema),
  metadata: z.object({
    date: z.string(),
    count: z.number(),
  }),
})
