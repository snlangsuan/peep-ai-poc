import { z } from 'zod'

/** Number of images the endpoint expects in a single request. */
export const IMAGE_INSIGHT_IMAGE_COUNT = 6
/** Number of synthesized text-representation items returned alongside the images. */
export const IMAGE_INSIGHT_TEXT_COUNT = 3
/** Allowed image mime types for upload. */
export const IMAGE_INSIGHT_ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
/** Per-file size limit in bytes (10 MB). */
export const IMAGE_INSIGHT_MAX_FILE_SIZE = 10 * 1024 * 1024

export const imageInsightItemSchema = z.object({
  // 'image' items carry a `link` to the uploaded picture; 'text' items carry a
  // synthesized `text` representation of the whole set.
  kind: z.enum(['image', 'text']),
  link: z.string().nullable(),
  text: z.string().nullable(),
  mood_type: z.string(),
  topic: z.string(),
  keywords: z.array(z.string()).length(3),
})

export const imageInsightResponseSchema = z.object({
  // The invite code this request was authorized by.
  code: z.string(),
  // Headline + caption (with hashtags) synthesized for the whole set of images.
  title: z.string(),
  caption: z.string().max(1000),
  items: z.array(imageInsightItemSchema),
})
