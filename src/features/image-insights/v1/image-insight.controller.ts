import { streamSSE } from 'hono/streaming'

import { HttpException } from '#/common/exceptions/http.exception'
import InvalidParameterException from '#/common/exceptions/invalid.parameter.exception'
import { logger } from '#/common/libs/logger.lib'
import {
  IMAGE_INSIGHT_ALLOWED_MIME,
  IMAGE_INSIGHT_IMAGE_COUNT,
  IMAGE_INSIGHT_MAX_FILE_SIZE,
  imageInsightResponseSchema,
} from '#/features/image-insights/v1/image-insight.schema'

import type { Bindings, Variables } from '#/common/types/app.type'
import type { ImageInsightService } from '#/features/image-insights/v1/image-insight.service'
import type { IImageInput } from '#/features/image-insights/v1/image-insight.type'
import type { Context } from 'hono'

/** How often to emit a keep-alive ping while the analysis runs (ms). */
const HEARTBEAT_INTERVAL_MS = 10_000

export class ImageInsightController {
  private service: ImageInsightService

  constructor(service: ImageInsightService) {
    this.service = service
  }

  analyze = async <E extends { Bindings: Bindings; Variables: Variables }, P extends string>(
    c: Context<E, P>,
  ): Promise<Response> => {
    const userId = c.get('user_id')

    // Validate input first so bad requests return a normal JSON 400.
    const body = await c.req.parseBody({ all: true })
    const images = await this.parseImages(body.images)

    // Stream the potentially slow part — upload + vision — as Server-Sent Events
    // with a periodic heartbeat so proxies don't kill an idle-looking connection
    // while we wait on the model. The client receives:
    //   event: ping    → keep-alive (ignore)
    //   event: result  → final JSON payload (imageInsightResponseSchema)
    //   event: error   → { status, message } if processing failed
    return streamSSE(c, async (stream) => {
      let done = false
      const heartbeat = (async () => {
        while (!done) {
          await stream.sleep(HEARTBEAT_INTERVAL_MS)
          if (!done) await stream.writeSSE({ event: 'ping', data: 'keep-alive' })
        }
      })()

      const event = await this.runAnalysis(userId, images)
      done = true
      await stream.writeSSE(event)
      await heartbeat
    })
  }

  /** Runs the analysis and maps the outcome to the SSE event to emit. */
  private async runAnalysis(userId: string, images: IImageInput[]): Promise<{ event: string; data: string }> {
    try {
      const result = await this.service.analyze(userId, images)
      return { event: 'result', data: JSON.stringify(imageInsightResponseSchema.parse(result)) }
    } catch (error) {
      const status = error instanceof HttpException ? error.statusCode : 500
      const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      if (!(error instanceof HttpException)) {
        logger.error({ error }, '[image-insight] analysis failed')
      }
      return { event: 'error', data: JSON.stringify({ status, message }) }
    }
  }

  /** Decodes and validates the multipart `images` field into exactly N image inputs. */
  private async parseImages(value: unknown): Promise<IImageInput[]> {
    const files = this.collectFiles(value)

    if (files.length !== IMAGE_INSIGHT_IMAGE_COUNT) {
      throw new InvalidParameterException(`Exactly ${IMAGE_INSIGHT_IMAGE_COUNT} images are required.`, 400, [
        { property: 'images', message: `Expected ${IMAGE_INSIGHT_IMAGE_COUNT} files, received ${files.length}.` },
      ])
    }

    const images: IImageInput[] = []
    for (const [index, file] of files.entries()) {
      if (!IMAGE_INSIGHT_ALLOWED_MIME.includes(file.type)) {
        throw new InvalidParameterException('Unsupported image type.', 400, [
          { property: `images[${index}]`, message: `Unsupported type "${file.type}".` },
        ])
      }
      if (file.size > IMAGE_INSIGHT_MAX_FILE_SIZE) {
        throw new InvalidParameterException('Image too large.', 400, [
          { property: `images[${index}]`, message: 'File exceeds the 10MB limit.' },
        ])
      }
      images.push({ buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type })
    }
    return images
  }

  /** Normalizes the parsed multipart value for the `images` field into a flat list of Files. */
  private collectFiles(value: unknown): File[] {
    const raw = Array.isArray(value) ? value : value === undefined ? [] : [value]
    return raw.filter((item): item is File => item instanceof File)
  }
}
