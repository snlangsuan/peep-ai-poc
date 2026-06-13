import { IMAGE_TTL_MS } from '#/common/services/storage.service'
import { decodeImageKey } from '#/features/image-insights/v1/image-file.helper'

import type { Bindings, Variables } from '#/common/types/app.type'
import type { StorageService } from '#/common/services/storage.service'
import type { Context } from 'hono'

export class ImageFileController {
  private storageService: StorageService

  constructor(storageService: StorageService) {
    this.storageService = storageService
  }

  /** Streams an uploaded image back through our API (so the frontend avoids CORS). */
  serve = async <E extends { Bindings: Bindings; Variables: Variables }, P extends string>(
    c: Context<E, P>,
  ): Promise<Response> => {
    const key = c.req.param('key')
    const objectPath = key ? decodeImageKey(key) : null
    if (!objectPath) {
      return c.json({ error: { message: 'Invalid image key.' } }, 400)
    }

    const image = await this.storageService.getImage(objectPath)
    if (!image) {
      return c.json({ error: { message: 'Image not found or expired.' } }, 404)
    }

    // Copy out the exact bytes (handles Buffer views with a non-zero offset).
    const body = image.buffer.buffer.slice(
      image.buffer.byteOffset,
      image.buffer.byteOffset + image.buffer.byteLength,
    ) as ArrayBuffer

    return c.body(body, 200, {
      'Content-Type': image.contentType,
      'Cache-Control': `private, max-age=${Math.floor(IMAGE_TTL_MS / 1000)}`,
    })
  }
}
