import { logger } from '#/common/libs/logger.lib'
import type { ChatRepository } from '#/features/chats/v1/chat.repository'
import type { ScheduleService } from '#/features/schedules/v1/schedule.service'
import dayjs from 'dayjs'

export class NotificationService {
  private isProcessing = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly scheduleService: ScheduleService,
    private readonly chatRepository: ChatRepository,
  ) {}

  start(intervalMs: number = 60000) {
    if (this.timer) return
    logger.info('NotificationService started')
    this.timer = setInterval(() => this.process(), intervalMs)
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
      logger.info('NotificationService stopped')
    }
  }

  private async process() {
    if (this.isProcessing) return
    this.isProcessing = true

    try {
      await Promise.all([this.processSchedules()])
    } catch (error) {
      logger.error({ error }, 'Error in NotificationService')
    } finally {
      this.isProcessing = false
    }
  }

  private async processSchedules() {
    const pending = await this.scheduleService.listPendingSchedules()
    for (const schedule of pending) {
      try {
        const timeStr = schedule.time ? ` เวลา ${schedule.time}` : ''
        const locationStr = schedule.location ? ` ที่ ${schedule.location}` : ''
        const message = `📅 แจ้งเตือนนัดหมาย: ${schedule.title}${timeStr}${locationStr}\n(ในอีก ${schedule.remind_before_minutes} นาที)`

        await this.chatRepository.send(schedule.created_by, 'bot', { message })
        await this.scheduleService.markAsNotified(schedule.id)
        logger.info({ schedule_id: schedule.id }, 'Schedule notification sent to chat')
      } catch (error) {
        logger.error({ error, schedule_id: schedule.id }, 'Failed to send schedule notification')
      }
    }
  }
}
