import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class SummaryTool implements IChatTool {
  readonly name = 'summary_tool'
  readonly description = 'วิเคราะห์สรุปข้อมูลประวัติการพูดคุย การเงิน หรือแผนภาพรวมของผู้ใช้งาน (ขณะนี้เป็นฟังก์ชันโครงร่างชั่วคราว)'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description: 'คำร้องขอเกี่ยวกับบทสรุปย่อหรือข้อมูลสถิติ',
      },
    },
  }

  async execute(args: { query?: string }, context: IChatContext): Promise<string> {
    return JSON.stringify({
      status: 'placeholder',
      message: 'น้องคลาวดี้ได้รับคำร้องขอให้สรุปข้อมูลภาพรวมเรียบร้อยแล้วจ้า! ☁️✨\n\n(นี่คือระบบสรุปข้อมูลร่างชั่วคราวเพื่อเตรียมเชื่อมโยงระบบวิเคราะห์เชิงลึกทางการเงินแบบเรียลไทม์ในอนาคตอันใกล้จ้า!)',
    })
  }
}
