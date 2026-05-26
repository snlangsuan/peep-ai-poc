import { Cron } from 'croner'

import { logger } from '#/common/libs/logger.lib'

import type { IScheduleModule } from '#/worker/schedule/schedule.type'

export class ScheduleWorker {
  private modules: IScheduleModule[] = []
  private activeJobs: Cron[] = []

  constructor() {
    logger.info('⏰ ScheduleWorker coordinator initialized')
  }

  addModule(module: IScheduleModule): this {
    logger.info({ moduleName: module.name }, '➕ Registering schedule module')
    this.modules.push(module)
    return this
  }

  start(): void {
    logger.info('🚀 Starting schedule worker coordinator...')

    if (this.activeJobs.length > 0) {
      this.stop()
    }

    for (const module of this.modules) {
      const cronOptions: { timezone?: string } = {}
      if (module.timezone) {
        cronOptions.timezone = module.timezone
      }
      logger.info(
        {
          module: module.name,
          cronPattern: module.cronPattern,
          timezone: module.timezone || 'Local (System)',
        },
        '⏰ Scheduling task module',
      )

      const job = new Cron(module.cronPattern, cronOptions, async () => {
        try {
          logger.info(`🔄 [SCHEDULE] Executing module: ${module.name}`)
          await module.execute()
          logger.info(`✅ [SCHEDULE] Module completed: ${module.name}`)
        } catch (error) {
          logger.error({ error, module: module.name }, `❌ [SCHEDULE] Module execution failed`)
        }
      })

      this.activeJobs.push(job)
    }

    logger.info('✅ All schedule task modules scheduled successfully.')
  }

  stop(): void {
    logger.info('Stopping all active scheduled tasks...')
    for (const job of this.activeJobs) {
      job.stop()
    }
    this.activeJobs = []
    logger.info('⏰ All active scheduled tasks stopped cleanly.')
  }
}
