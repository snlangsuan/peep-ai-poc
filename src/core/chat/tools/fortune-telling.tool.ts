import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import {
  ASK_BIRTHDATE_MESSAGE,
  FORTUNE_UNAVAILABLE_MESSAGE,
  resolveDailyFortune,
  saveFortuneChat,
} from '#/features/chats/v1/fortune-card.helper'
import { ZODIAC_SIGNS, getSignKeyByBirthdate } from '#/features/horoscopes/v1/horoscope.constant'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class FortuneTellingTool implements IChatTool {
  readonly name = 'fortune_telling'
  readonly description =
    'ทำนายดวงชะตาประจำวันของผู้ใช้ โดยจะตรวจสอบวันเกิดก่อน หากยังไม่มีจะถามข้อมูล และเมื่อมีแล้วจะดึงคำทำนายประจำวันตามราศีมาแสดงเป็นการ์ดให้ผู้ใช้'
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

    try {
      if (action === 'check_and_start') {
        return await this.produceFortune(userId)
      }

      if (action === 'save_birthdate') {
        if (!birthdate) {
          return JSON.stringify({ error: 'Missing required field: "birthdate" is required when action is "save_birthdate".' })
        }

        // Convert the birthdate to a zodiac sign (using the in-code date ranges)
        // and store both, so the sign is ready to use without recomputing.
        const signKey = getSignKeyByBirthdate(birthdate)
        const signName = signKey ? ZODIAC_SIGNS.find((s) => s.key === signKey)?.name : undefined

        const docRef = db.collection('user_memories').doc(userId)
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef)
          const memories = (doc.data()?.memories || {}) as Record<string, string>
          memories.birthdate = birthdate
          if (signKey) memories.zodiac_sign = signKey
          if (signName) memories.zodiac_sign_name = signName
          transaction.set(docRef, { memories }, { merge: true })
        })
        logger.info({ userId, birthdate, signKey }, 'Saved birthdate + zodiac sign for fortune telling.')

        // Birthdate is now stored — go straight to producing today's fortune.
        return await this.produceFortune(userId)
      }

      return JSON.stringify({ error: `Unsupported action: "${action}"` })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong while executing fortune telling.'
      return JSON.stringify({ error: message })
    }
  }

  /**
   * Resolves today's fortune for the user. If no/invalid birthdate, returns a
   * message asking for it (the agent relays it). If ready, pre-saves the fortune
   * card chat and signals the agent to use it as the final message.
   */
  private async produceFortune(userId: string): Promise<string> {
    const result = await resolveDailyFortune(userId)

    if (result.status === 'need_birthdate') {
      return JSON.stringify({ status: 'need_birthdate', has_birthdate: false, message: ASK_BIRTHDATE_MESSAGE })
    }
    if (result.status === 'unavailable') {
      return JSON.stringify({ status: 'unavailable', message: FORTUNE_UNAVAILABLE_MESSAGE })
    }

    // Pre-save the card (no SSE here — the agent emits the `done` event from it).
    const saved = await saveFortuneChat(userId, result.content, { emitSSE: false })
    logger.info({ userId, chatId: saved.id }, '[fortune] pre-saved daily fortune card for agent done event')
    return JSON.stringify({
      status: 'success',
      __suppress_agent_response: true,
      __agent_saved_message: {
        id: saved.id,
        content: saved.content,
        createdAt: saved.createdAt.toISOString(),
      },
    })
  }
}
