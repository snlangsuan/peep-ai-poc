import { db } from '#/common/libs/firebase.lib'

import type { IChatContext, IChatTool } from '#/core/chat/chat.type'

export class CreateScheduleTool implements IChatTool {
  readonly name = 'create_schedule'
  readonly description = 'สร้างกำหนดการแจ้งเตือนใหม่ในระบบ Firestore'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      scheduledAt: {
        type: 'STRING',
        description: 'วันและเวลาที่ต้องการให้แจ้งเตือน รูปแบบ ISO 8601 (เช่น 2026-05-22T19:35:00+07:00)',
      },
      message: {
        type: 'STRING',
        description: 'ข้อความที่ต้องการแจ้งเตือนเมื่อถึงเวลากำหนด',
      },
      type: {
        type: 'STRING',
        description: 'ประเภทของการแจ้งเตือน (เช่น user_schedule)',
      },
    },
    required: ['scheduledAt', 'message'],
  }

  async execute(args: { scheduledAt: string; message: string; type?: string }, context: IChatContext): Promise<any> {
    const docRef = db.collection('schedules').doc()
    const scheduledDate = new Date(args.scheduledAt)
    await docRef.set({
      scheduled_at: scheduledDate,
      before_sent_at: null,
      sent_at: null,
      payload: {
        message: args.message,
        type: args.type || 'user_schedule',
        userId: context.userId,
      },
    })
    return {
      id: docRef.id,
      scheduledAt: scheduledDate.toISOString(),
      message: args.message,
      type: args.type || 'user_schedule',
    }
  }
}
