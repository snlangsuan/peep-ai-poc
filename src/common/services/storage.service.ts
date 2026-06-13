import { logger } from '#/common/libs/logger.lib'
import { storage, storageBucketName } from '#/common/libs/firebase.lib'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Uploaded images are short-lived — kept for this long, then swept by the cleanup worker. */
export const IMAGE_TTL_MS = 3 * 60 * 60 * 1000

export interface IUploadInput {
  buffer: Buffer
  mimeType: string
}

/**
 * Uploads image buffers to Cloud Storage. Objects are kept PRIVATE and served
 * back through our own API (see the image-file route) so the frontend never hits
 * the GCS origin directly — this avoids CORS issues and keeps URLs revocable.
 * Files are stored under `images/<prefix>/<uuid>.<ext>`. Returns the object path.
 */
export class StorageService {
  async uploadImage(input: IUploadInput, prefix = 'shared'): Promise<string> {
    const bucket = storage.bucket(storageBucketName)
    const ext = MIME_EXTENSION[input.mimeType] ?? 'bin'
    const objectPath = `images/${prefix}/${getUUID()}.${ext}`
    const file = bucket.file(objectPath)

    try {
      await file.save(input.buffer, {
        resumable: false,
        contentType: input.mimeType,
        metadata: {
          metadata: { expires_at: getUtcTime().add(IMAGE_TTL_MS, 'millisecond').toISOString() },
        },
      })
      return objectPath
    } catch (error) {
      logger.error({ error, objectPath }, 'StorageService.uploadImage failed')
      throw error
    }
  }

  async uploadImages(inputs: IUploadInput[], prefix = 'shared'): Promise<string[]> {
    return Promise.all(inputs.map((input) => this.uploadImage(input, prefix)))
  }

  /** Downloads an object's bytes + content type for proxying. Returns null if missing. */
  async getImage(objectPath: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    const bucket = storage.bucket(storageBucketName)
    const file = bucket.file(objectPath)
    try {
      const [exists] = await file.exists()
      if (!exists) return null
      const [metadata] = await file.getMetadata()
      const [buffer] = await file.download()
      return { buffer, contentType: metadata.contentType || 'application/octet-stream' }
    } catch (error) {
      logger.error({ error, objectPath }, 'StorageService.getImage failed')
      throw error
    }
  }

  /**
   * Deletes uploaded images older than `maxAgeMs` (default {@link IMAGE_TTL_MS}).
   * Driven by the cleanup worker since GCS lifecycle rules only support day-level
   * granularity. Returns the number of objects removed.
   */
  async deleteExpiredImages(maxAgeMs: number = IMAGE_TTL_MS, prefix = 'images/'): Promise<number> {
    const bucket = storage.bucket(storageBucketName)
    const [files] = await bucket.getFiles({ prefix })
    const cutoff = getUtcTime().valueOf() - maxAgeMs

    const results = await Promise.all(
      files.map(async (file) => {
        const createdAt = file.metadata.timeCreated ? getUtcTime(file.metadata.timeCreated).valueOf() : 0
        if (!createdAt || createdAt >= cutoff) return 0
        try {
          await file.delete({ ignoreNotFound: true })
          return 1
        } catch (error) {
          logger.warn({ error, name: file.name }, 'StorageService.deleteExpiredImages: failed to delete object')
          return 0
        }
      }),
    )
    return results.reduce<number>((sum, n) => sum + n, 0)
  }
}
