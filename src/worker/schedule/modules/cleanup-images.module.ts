import { logger } from '#/common/libs/logger.lib'
import { IMAGE_TTL_MS, StorageService } from '#/common/services/storage.service'

import type { IScheduleModule } from '#/worker/schedule/schedule.type'

/**
 * Sweeps expired image uploads. Uploaded images live for {@link IMAGE_TTL_MS}
 * (3 hours); this runs every 15 minutes and deletes anything past its TTL.
 * Needed because GCS lifecycle rules only support day-level granularity.
 */
export class CleanupImagesModule implements IScheduleModule {
  readonly name = 'cleanup-images'
  readonly cronPattern = '*/15 * * * *'

  private storageService = new StorageService()

  async execute(): Promise<void> {
    try {
      const deleted = await this.storageService.deleteExpiredImages(IMAGE_TTL_MS)
      if (deleted > 0) {
        logger.info({ deleted }, '🧹 [CleanupImagesModule] removed expired images')
      }
    } catch (error) {
      logger.error(error, '❌ [CleanupImagesModule] failed to clean up expired images')
      throw error
    }
  }
}
