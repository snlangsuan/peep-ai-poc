import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { sseBroker } from '#/common/services/sse-broker.service'
import { getLocalTime, getUtcTime } from '#/common/utils/datetime.util'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { getCurrentSessionId } from '#/features/chats/v1/chat-session.helper'
import { pushBotTextMessage } from '#/features/chats/v1/mood-card.helper'
import { getSignKeyByBirthdate } from '#/features/horoscopes/v1/horoscope.constant'
import { HoroscopeRepository } from '#/features/horoscopes/v1/horoscope.repository'
import { ensureHoroscopeForSign } from '#/worker/schedule/modules/generate-horoscope.module'

import type { TChatResponse } from '#/features/chats/v1/chat.type'

export const FORTUNE_TEXT = 'ดูดวงประจำวัน'
export const ASK_BIRTHDATE_MESSAGE =
  'ขอวันเดือนปีเกิดของคุณหน่อย (รูปแบบ ปปปป-ดด-วว เช่น 1995-12-25) คลาวดี้จะได้ดูดวงประจำวันให้แม่น ๆ'
export const FORTUNE_UNAVAILABLE_MESSAGE = 'ตอนนี้ยังไม่มีคำทำนายประจำวัน ลองใหม่อีกครั้งในภายหลัง'

export type TFortuneResolution =
  | { status: 'need_birthdate' }
  | { status: 'unavailable' }
  | { status: 'ready'; content: TChatResponse['content'] }

export interface ISavedFortuneMessage {
  id: string
  content: TChatResponse['content']
  createdAt: Date
}

/**
 * Resolves the daily fortune for a user: checks the saved birthdate, derives the
 * zodiac sign, and builds the fortune-card chat content for today. Does NOT save
 * or emit — callers decide how to deliver it.
 */
export async function resolveDailyFortune(userId: string): Promise<TFortuneResolution> {
  const memDoc = await db.collection('user_memories').doc(userId).get()
  const memories = (memDoc.data()?.memories || {}) as Record<string, string>

  // Prefer the stored zodiac sign; otherwise derive it from the saved birthdate.
  const signKey = memories.zodiac_sign || (memories.birthdate ? getSignKeyByBirthdate(memories.birthdate) : undefined)
  if (!signKey) return { status: 'need_birthdate' }

  const date = getLocalTime().format('YYYY-MM-DD')
  const repo = new HoroscopeRepository()

  let items = await repo.listByDate(date, signKey)
  if (items.length === 0) {
    // Fallback: cron hasn't populated today yet — generate this sign on demand.
    await ensureHoroscopeForSign(date, signKey)
    items = await repo.listByDate(date, signKey)
  }
  if (items.length === 0) return { status: 'unavailable' }

  const h = items[0]!
  const content: TChatResponse['content'] = [
    { type: 'text', text: FORTUNE_TEXT },
    {
      type: 'fortune-telling',
      created_at: getUtcTime().toISOString(),
      date: h.date,
      sign_name: h.sign,
      sign_key: h.sign_key,
      date_range: h.date_range,
      tagline: h.tagline,
      work: h.work,
      love: h.love,
      finance: h.finance,
      lucky_numbers: h.lucky_numbers.map((n) => Number(n)).filter((n) => Number.isFinite(n)),
      lucky_color: h.lucky_color,
      lucky_time: h.lucky_time,
      energy_level: h.energy_level,
      energy: h.energy,
    },
  ]
  return { status: 'ready', content }
}

/**
 * Persists a fortune chat message (bot) into Firestore, stamped with the current
 * session. Optionally emits the SSE `done` event. Returns the saved message so a
 * caller (e.g. the chat agent) can reuse it.
 */
export async function saveFortuneChat(
  userId: string,
  content: TChatResponse['content'],
  options: { emitSSE?: boolean } = {},
): Promise<ISavedFortuneMessage> {
  const sessionId = await getCurrentSessionId(userId)
  const docRef = db.collection('chats').doc()
  const createdAt = getUtcTime().toDate()

  await docRef.set({
    user_id: userId,
    session_id: sessionId,
    sender_id: 'bot',
    content,
    feedback: null,
    error: null,
    created_at: createdAt,
  })

  if (options.emitSSE) {
    const message = mapRawChatToResponse({
      id: docRef.id,
      user_id: userId,
      sender_id: 'bot',
      content,
      created_at: createdAt,
    })
    sseBroker.emit(userId, { type: 'done', message })
  }

  return { id: docRef.id, content, createdAt }
}

/**
 * Full delivery used by the action-trigger endpoint (no chat agent involved):
 * resolves the fortune and pushes the result (or a birthdate request) via SSE +
 * Firestore. Returns the resolution status.
 */
export async function pushDailyFortune(userId: string): Promise<TFortuneResolution['status']> {
  try {
    const result = await resolveDailyFortune(userId)
    if (result.status === 'need_birthdate') {
      await pushBotTextMessage(userId, ASK_BIRTHDATE_MESSAGE)
    } else if (result.status === 'unavailable') {
      await pushBotTextMessage(userId, FORTUNE_UNAVAILABLE_MESSAGE)
    } else {
      await saveFortuneChat(userId, result.content, { emitSSE: true })
    }
    return result.status
  } catch (error) {
    logger.error({ error, userId }, '[fortune] failed to push daily fortune')
    await pushBotTextMessage(userId, FORTUNE_UNAVAILABLE_MESSAGE)
    return 'unavailable'
  }
}
