import { z } from 'zod'
import type { extractMessageItemResponseSchema, extractMessageRequestBodyPayloadSchema, extractMessageResponseSchema } from './message.schema'

export type TExtractMessageItem = z.infer<typeof extractMessageItemResponseSchema>
export type TExtractMessageResponse = z.infer<typeof extractMessageResponseSchema>

export type TExtractMessageRequestBodyPayload = z.infer<typeof extractMessageRequestBodyPayloadSchema>
