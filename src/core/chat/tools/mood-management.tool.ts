import { db } from '#/common/libs/firebase.lib'
import { getUtcTime, getLocalTime } from '#/common/utils/datetime.util'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class MoodManagementTool implements IChatTool {
  readonly name = 'manage_mood'
  readonly description = 'วิเคราะห์สรุปแนวโน้มระดับอารมณ์ (Mood) ของผู้ใช้ย้อนหลังในช่วง 7 วันล่าสุด (หมายเหตุ: เครื่องมือนี้สำหรับอ่านผลลัพธ์เท่านั้น การอัปเดตอารมณ์จะกระทำผ่านการ์ดพิเศษที่ระบบยิงให้ตอน 6 โมงเย็นภายนอกระบบแชท)'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        description: 'การดำเนินการ: "summarize" (สรุปและวิเคราะห์ระดับอารมณ์ย้อนหลัง 7 วันล่าสุด)',
      },
    },
    required: ['action'],
  }

  async execute(
    args: {
      action: 'summarize'
    },
    context: IChatContext,
  ): Promise<string> {
    const { action } = args
    const userId = context.userId
    const moodsCollection = db.collection('user_moods')

    try {
      if (action === 'summarize') {
        const sevenDaysAgoDate = getLocalTime().subtract(7, 'days').format('YYYY-MM-DD')
        
        // Fetch user moods from the last 7 days
        const snapshot = await moodsCollection
          .where('user_id', '==', userId)
          .where('date', '>=', sevenDaysAgoDate)
          .get()

        const docs = snapshot.docs.map(doc => doc.data())
        
        if (docs.length === 0) {
          return JSON.stringify({
            status: 'empty',
            message: 'ไม่พบประวัติการบันทึกอารมณ์ของคุณในช่วง 7 วันที่ผ่านมาเลยจ้า เริ่มต้นบันทึกอารมณ์วันนี้ผ่านหน้าต่างแจ้งเตือนตอนเย็นกันก่อนนะจ๊ะ!',
          })
        }

        // Count occurrences of each mood
        const moodCounts: Record<string, number> = {}
        docs.forEach(doc => {
          const m = doc.mood as string
          moodCounts[m] = (moodCounts[m] || 0) + 1
        })

        return JSON.stringify({
          status: 'success',
          total_records: docs.length,
          period: '7 days',
          mood_counts: moodCounts,
          recent_notes: docs.filter(doc => doc.note).map(doc => ({
            date: doc.date,
            mood: doc.mood,
            note: doc.note,
          })),
        })
      }

      return JSON.stringify({ error: `Unsupported action: "${action}"` })
    } catch (err: any) {
      return JSON.stringify({ error: err.message || 'Something went wrong while managing moods.' })
    }
  }
}
