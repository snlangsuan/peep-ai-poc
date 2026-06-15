import { logger } from '#/common/libs/logger.lib'
import { resolveSummary, saveSummaryChat } from '#/features/chats/v1/summary-card.helper'
import { SUMMARY_NAMED_PERIODS } from '#/features/summaries/v1/summary.period'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'
import type { IPeriodInput, TSummaryNamedPeriod } from '#/features/summaries/v1/summary.period'

export class SummaryTool implements IChatTool {
  readonly name = 'summary_tool'
  readonly description =
    'สรุป "ภาพรวมรวมทุกด้าน" ของผู้ใช้ในช่วงเวลาที่ระบุ (todo + นัดหมาย + ค่าใช้จ่าย + อารมณ์ พร้อมกันในการ์ดเดียว). ใช้เฉพาะเมื่อผู้ใช้ขอสรุปภาพรวมทั้งหมด/หลายด้านรวมกัน เช่น "สรุปวันนี้", "สรุปเดือนนี้", "ภาพรวม 30 วัน". เลือก period ให้ตรงกับที่ผู้ใช้พูด (today=วันนี้, yesterday=เมื่อวาน, 7d=7 วันล่าสุด, 30d=30 วันล่าสุด, this_week=สัปดาห์นี้, this_month=เดือนนี้) หรือใส่ start_date/end_date ถ้าผู้ใช้ระบุช่วงวันที่เอง. ถ้าไม่ระบุชัดให้ละไว้ (default เป็นเดือนนี้). ห้ามใช้กับการสรุปเฉพาะด้านเดียว เช่น "สรุปค่าใช้จ่าย" (ใช้ manage_expenses), "สรุปงาน" (ใช้ manage_todos)'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      period: {
        type: 'STRING',
        enum: [...SUMMARY_NAMED_PERIODS],
        description: 'ช่วงเวลาที่ต้องการสรุป (optional): today, yesterday, 7d, 30d, this_week, this_month',
      },
      start_date: {
        type: 'STRING',
        description: 'วันเริ่มช่วง YYYY-MM-DD (ใช้คู่กับ end_date เมื่อผู้ใช้ระบุช่วงวันที่เอง)',
      },
      end_date: {
        type: 'STRING',
        description: 'วันสิ้นสุดช่วง YYYY-MM-DD (ใช้คู่กับ start_date)',
      },
    },
  }

  async execute(
    args: { period?: string; start_date?: string; end_date?: string },
    context: IChatContext,
  ): Promise<string> {
    const userId = context.userId
    try {
      // Build the summary for the requested period, pre-save it, and let the agent
      // emit the `done` event from the pre-saved card (no duplicate agent text).
      const content = await resolveSummary(userId, this.toPeriodInput(args))
      const saved = await saveSummaryChat(userId, content, { emitSSE: false })
      logger.info({ userId, chatId: saved.id }, '[summary] pre-saved summary card for agent done event')
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
      logger.error({ error, userId }, '[summary] failed to build summary')
      return JSON.stringify({ error: 'สรุปภาพรวมไม่สำเร็จ ลองใหม่อีกครั้งในภายหลัง' })
    }
  }

  /** Maps tool args to a period input; an explicit date range wins over a named period. */
  private toPeriodInput(args: { period?: string; start_date?: string; end_date?: string }): IPeriodInput {
    if (args.start_date && args.end_date) {
      return { start_date: args.start_date, end_date: args.end_date }
    }
    const period = SUMMARY_NAMED_PERIODS.includes(args.period as TSummaryNamedPeriod)
      ? (args.period as TSummaryNamedPeriod)
      : undefined
    return { period }
  }
}
