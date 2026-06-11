import { logger } from '#/common/libs/logger.lib'
import { resolveMonthlySummary, saveSummaryChat } from '#/features/chats/v1/summary-card.helper'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class SummaryTool implements IChatTool {
  readonly name = 'summary_tool'
  readonly description =
    'สรุป "ภาพรวมรวมทุกด้าน" ของผู้ใช้ในเดือนปัจจุบัน (todo + นัดหมาย + ค่าใช้จ่าย + อารมณ์ พร้อมกันในการ์ดเดียว). ใช้เฉพาะเมื่อผู้ใช้ขอสรุปภาพรวมทั้งหมด/หลายด้านรวมกัน เช่น "สรุปเดือนนี้", "ภาพรวมเดือนนี้". ห้ามใช้กับการสรุปเฉพาะด้านเดียว เช่น "สรุปค่าใช้จ่าย" (ใช้ manage_expenses), "สรุปงาน" (ใช้ manage_todos)'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description: 'คำร้องขอเกี่ยวกับบทสรุปภาพรวม (optional)',
      },
    },
  }

  async execute(_args: { query?: string }, context: IChatContext): Promise<string> {
    const userId = context.userId
    try {
      // Build this month's summary, pre-save it, and let the agent emit the
      // `done` event from the pre-saved card (no duplicate agent text).
      const content = await resolveMonthlySummary(userId)
      const saved = await saveSummaryChat(userId, content, { emitSSE: false })
      logger.info({ userId, chatId: saved.id }, '[summary] pre-saved monthly summary card for agent done event')
      return JSON.stringify({
        status: 'success',
        __suppress_agent_response: true,
        __agent_saved_message: {
          id: saved.id,
          content: saved.content,
          createdAt: saved.createdAt.toISOString(),
        },
      })
    } catch (error) {
      logger.error({ error, userId }, '[summary] failed to build monthly summary')
      return JSON.stringify({ error: 'สรุปภาพรวมไม่สำเร็จ ลองใหม่อีกครั้งในภายหลัง' })
    }
  }
}
