import type {
  summaryMonthlyPayloadSchema,
  summaryMonthlyResponseSchema,
  summaryMoodCountSchema,
} from '#/features/summaries/v1/summary.schema'
import type { z } from 'zod'

export type TSummaryMonthlyPayload = z.infer<typeof summaryMonthlyPayloadSchema>
export type TSummaryMonthlyResponse = z.infer<typeof summaryMonthlyResponseSchema>
export type TSummaryMoodCount = z.infer<typeof summaryMoodCountSchema>
