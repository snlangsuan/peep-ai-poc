import type {
  horoscopeAspectSchema,
  horoscopeFilterPayloadSchema,
  horoscopeItemResponseSchema,
  horoscopeResponseSchema,
} from '#/features/horoscopes/v1/horoscope.schema'
import type { z } from 'zod'

export type THoroscopeAspect = z.infer<typeof horoscopeAspectSchema>
export type THoroscopeResponse = z.infer<typeof horoscopeResponseSchema>
export type THoroscopeFilterPayload = z.infer<typeof horoscopeFilterPayloadSchema>
export type THoroscopeItemResponse = z.infer<typeof horoscopeItemResponseSchema>
