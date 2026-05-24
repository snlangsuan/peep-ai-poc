import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'

import type { IChatContext, IChatTool } from '#/core/chat/chat.type'

export class FortuneTellingTool implements IChatTool {
  readonly name = 'fortune_telling'
  readonly description = 'ทำนายดวงชะตาของผู้ใช้ โดยจะตรวจสอบวันเกิดก่อน หากยังไม่มีจะถามข้อมูล และเมื่อมีแล้วจะสร้าง Action Link เพื่อเปิดหน้าทำนายดวงบนแอปพลิเคชัน'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        description: 'การดำเนินการ: "check_and_start" (ตรวจสอบและเริ่มทำนายดวง) หรือ "save_birthdate" (บันทึกวันเกิดใหม่เมื่อผู้ใช้แจ้งข้อมูลเข้ามา)',
      },
      birthdate: {
        type: 'STRING',
        description: 'วันเดือนปีเกิดของผู้ใช้งาน รูปแบบ YYYY-MM-DD เช่น 1995-12-25 (จำเป็นเมื่อ action คือ "save_birthdate")',
      },
    },
    required: ['action'],
  }

  async execute(
    args: {
      action: 'check_and_start' | 'save_birthdate'
      birthdate?: string
    },
    context: IChatContext,
  ): Promise<string> {
    const { action, birthdate } = args
    const userId = context.userId
    const docRef = db.collection('user_memories').doc(userId)

    try {
      if (action === 'check_and_start') {
        const doc = await docRef.get()
        const memories = (doc.data()?.memories || {}) as Record<string, string>
        const storedBirthdate = memories.birthdate

        if (storedBirthdate) {
          logger.info({ userId, birthdate: storedBirthdate }, 'Found stored birthdate for fortune telling.')
          return JSON.stringify({
            status: 'success',
            has_birthdate: true,
            birthdate: storedBirthdate,
            type: 'action',
            link: 'peep://fortune-telling',
            message: `โหลดวันเดือนปีเกิดของคุณ (${storedBirthdate}) สำเร็จแล้วจ้า! พร้อมเปิดหน้าทำนายดวงชะตาให้แล้วน้า!`,
          })
        }

        logger.info({ userId }, 'No birthdate found for fortune telling.')
        return JSON.stringify({
          status: 'need_birthdate',
          has_birthdate: false,
          message: 'น้องคลาวดี้ยังไม่ทราบวันเดือนปีเกิดของคุณเลยจ้า ช่วยบอกวันเดือนปีเกิดของคุณ (ในรูปแบบ เช่น 25 ธันวาคม 2538 หรือ 1995-12-25) ให้น้องหน่อยนะจ๊ะ! จะได้นำไปดูดวงชะตาได้แม่นยำจ้า',
        })
      }

      if (action === 'save_birthdate') {
        if (!birthdate) {
          return JSON.stringify({ error: 'Missing required field: "birthdate" is required when action is "save_birthdate".' })
        }

        // Save birthdate into user_memories inside Firestore
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef)
          const memories = (doc.data()?.memories || {}) as Record<string, string>
          memories.birthdate = birthdate
          memories._chat_summary_count = memories._chat_summary_count || '0'
          transaction.set(docRef, { memories }, { merge: true })
        })

        logger.info({ userId, birthdate }, 'Saved new birthdate for fortune telling.')
        return JSON.stringify({
          status: 'success',
          has_birthdate: true,
          birthdate,
          type: 'action',
          link: 'peep://fortune-telling',
          message: `บันทึกวันเกิดเป็นวันที่ ${birthdate} สำเร็จแล้วจ้า! ยินดีต้อนรับเข้าสู่หน้าทำนายดวงชะตาของคุณนะจ๊ะ!`,
        })
      }

      return JSON.stringify({ error: `Unsupported action: "${action}"` })
    } catch (err: any) {
      return JSON.stringify({ error: err.message || 'Something went wrong while executing fortune telling.' })
    }
  }
}
