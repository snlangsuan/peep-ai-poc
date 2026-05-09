import type { ChatRepository } from '#/features/chats/v1/chat.repository'
import type {
  TSendMessage,
  TChatListFilter,
  TChatResponse,
  TChatListResponse,
  TChatResponseWithContent,
  TChatActionRequestBodyPayload,
} from '#/features/chats/v1/chat.type'
import { memoryQueueService } from '#/common/services/queue.service'
import { logger } from '#/common/libs/logger.lib'
import type { BrainService } from '#/features/chats/v1/brain.service'
import type { UidRepository } from '#/features/uid/v1/uid.repository'
import type { ExpenseService } from '#/features/expenses/v1/expense.service'
import type { ScheduleService } from '#/features/schedules/v1/schedule.service'
import { ChatFormatter } from '#/features/chats/v1/chat.formatter'
import InsufficientPermissionException from '~/src/common/exceptions/insufficient.permission.exception'
import { getLocalTime } from '~/src/common/utils/datetime.util'

export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly brainService: BrainService,
    private readonly uidRepository: UidRepository,
    private readonly expenseService: ExpenseService,
    private readonly scheduleService: ScheduleService,
  ) {
    logger.info('ChatService instantiated')
    // Register the processor for chat messages
    memoryQueueService.registerProcessor('chat_message', async (payload) => {
      await this.processMessage(payload)
    })
  }

  async send(sender_id: string, data: TSendMessage): Promise<TChatResponse> {
    // 1. Check Credits before sending
    const profile = await this.uidRepository.getProfile(sender_id)
    if ((profile?.credits ?? 0) <= 0) {
      throw new Error('OUT_OF_CREDITS')
    }

    // 2. Save to Firestore (In the user's room)
    const chatData = await this.chatRepository.send(sender_id, sender_id, data)

    // 3. Push to Queue for further processing
    await memoryQueueService.add('chat_message', {
      ...chatData,
    })

    return chatData
  }

  async list(user_id: string, filter: TChatListFilter): Promise<TChatListResponse> {
    return this.chatRepository.list(user_id, filter)
  }

  async getProfile(user_id: string) {
    return this.uidRepository.getProfile(user_id)
  }

  subscribe(user_id: string, onMessage: (message: TChatResponseWithContent) => void): () => void {
    return this.chatRepository.onNewMessage(user_id, async (message) => {
      // Fetch credits to send along with the message
      const profile = await this.uidRepository.getProfile(user_id)
      onMessage({
        ...message,
        credits: profile?.credits,
      })
    })
  }

  async handleAction(
    user_id: string,
    type: 'expenses' | 'schedules' | 'overall',
    filter: TChatActionRequestBodyPayload,
  ): Promise<void> {
    const s = getLocalTime(filter.start_date || getLocalTime().startOf('day'))
    const e = getLocalTime(filter.end_date || getLocalTime().endOf('day'))

    if (e.diff(s, 'day') > 365) {
      await this.chatRepository.send(user_id, 'bot', {
        message: 'ขออภัยครับ ระบบรองรับการสรุปข้อมูลย้อนหลังได้ไม่เกิน 1 ปีครับ กรุณาลองระบุช่วงเวลาที่สั้นลงดูนะครับ',
      })
      return
    }

    const startDate = s.startOf('day').format('YYYY-MM-DD HH:mm')
    const endDate = e.endOf('day').format('YYYY-MM-DD HH:mm')
    const dateRangeStr = ChatFormatter.formatDateRange(s.format('YYYY-MM-DD'), e.format('YYYY-MM-DD'))
    if (type === 'expenses') {
      const result = await this.expenseService.list(user_id, {
        page: 1,
        limit: 100,
        start_date: filter.start_date,
        end_date: filter.end_date,
        sort: 'date',
        desc: false,
      })

      console.log(result)
      const message = ChatFormatter.formatExpenseList(result, dateRangeStr)
      await this.chatRepository.send(user_id, 'bot', { message })
      return
    }

    if (type === 'schedules') {
      const result = await this.scheduleService.list(user_id, {
        page: 1,
        limit: 100,
        start_date: startDate,
        end_date: endDate,
        sort: 'scheduled_at',
        desc: false,
      })

      const isSingleDay = filter.start_date === filter.end_date
      const message = ChatFormatter.formatScheduleList(result, dateRangeStr, isSingleDay)
      await this.chatRepository.send(user_id, 'bot', { message })
      return
    }

    const profile = await this.uidRepository.getProfile(user_id)
    if ((profile?.credits ?? 0) <= 0) {
      throw new InsufficientPermissionException('OUT_OF_CREDITS')
    }

    return (this.brainService as any).generateDirectSummary(user_id, type, filter)
  }

  /**
   * Internal method to process the message via BrainService
   */
  private async processMessage(payload: {
    room_id: string
    message: string
    display_name?: string
    id: string
    created_at?: string | Date
  }): Promise<void> {
    try {
      let displayName = payload.display_name

      // If display_name is missing, try to look it up from the stored profile
      if (!displayName) {
        const profile = await this.uidRepository.getProfile(payload.room_id)
        if (profile) {
          displayName = profile.display_name
        }
      }

      logger.info({ message_id: payload.id, displayName }, 'Brain processing chat message...')
      await this.brainService.process(payload.room_id, payload.message, displayName, payload.created_at)
    } catch (error) {
      logger.error({ message_id: payload.id, error }, 'Error in BrainService processing')
    }
  }
}
