import type { imageInsightItemSchema, imageInsightResponseSchema } from '#/features/image-insights/v1/image-insight.schema'
import type { z } from 'zod'

export type TImageInsightItem = z.infer<typeof imageInsightItemSchema>
export type TImageInsightResponse = z.infer<typeof imageInsightResponseSchema>

/** A single decoded image ready for upload and vision analysis. */
export interface IImageInput {
  buffer: Buffer
  mimeType: string
}

/** Per-image analysis returned by the vision model. */
export interface IImageAnalysis {
  mood_type: string
  topic: string
  keywords: string[]
}

/** Synthesized text representation across the whole image set. */
export interface ITextAnalysis extends IImageAnalysis {
  text: string
}
