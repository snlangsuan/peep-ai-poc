import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { sseBroker } from '#/common/services/sse-broker.service'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { getCurrentSessionId } from '#/features/chats/v1/chat-session.helper'

import type { TScheduleResponse } from '#/features/schedules/v1/schedule.type'
import type { TChatResponse } from '#/features/chats/v1/chat.type'

const SCHEDULE_SAVED_TEXT = 'บันทึกนัดหมายเรียบร้อยแล้ว'
const SCHEDULE_CARD_TITLE = 'ตารางนัดหมาย'
const SCHEDULE_LIST_CARD_TITLE = 'ตารางนัดหมาย'

/** Max items shown in a list card; the card also carries the real item_count. */
export const LIST_CARD_MAX_ITEMS = 5

export interface IPushBotChatResult {
  id: string
  /** Firestore-native content array, mirrors what's saved in the chat doc. */
  content: TChatResponse['content']
  createdAt: Date
}

export interface IPushBotOptions {
  /** When false, save to Firestore but skip SSE emission (caller will emit via different event). Default true. */
  emitSSE?: boolean
}

async function saveChatBotMessage(
  userId: string,
  content: TChatResponse['content'],
): Promise<{ id: string; createdAt: Date }> {
  const docRef = db.collection('chats').doc()
  const createdAt = new Date()
  const sessionId = await getCurrentSessionId(userId)
  await docRef.set({
    user_id: userId,
    session_id: sessionId,
    sender_id: 'bot',
    content,
    feedback: null,
    error: null,
    created_at: createdAt,
  })
  return { id: docRef.id, createdAt }
}

export async function pushBotScheduleCreatedMessage(
  userId: string,
  schedules: TScheduleResponse[],
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  if (schedules.length === 0) return null
  const emitSSE = opts.emitSSE !== false

  try {
    const createdAtIso = new Date().toISOString()
    const items = schedules.map((s) => ({
      uuid: s.uuid,
      title: s.payload.title,
      scheduled_at: s.scheduled_at,
      created_at: s.createdAt || createdAtIso,
    }))
    const content: TChatResponse['content'] = [
      { type: 'text', text: SCHEDULE_SAVED_TEXT },
      {
        type: 'schedule',
        title: SCHEDULE_CARD_TITLE,
        subtitle: `${items.length} รายการ`,
        created_at: createdAtIso,
        items,
      },
    ]

    const { id, createdAt } = await saveChatBotMessage(userId, content)

    if (emitSSE) {
      const message = mapRawChatToResponse({
        id,
        user_id: userId,
        sender_id: 'bot',
        content,
        created_at: createdAt,
      })
      sseBroker.emit(userId, { type: 'done', message })
    }
    logger.info(
      { userId, chatId: id, scheduleCount: items.length, emitSSE },
      '[chat] pushed bot schedule_saved message (firestore + maybe SSE done)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot schedule_saved message')
    return null
  }
}

export async function pushBotScheduleListMessage(
  userId: string,
  schedules: TScheduleResponse[],
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  if (schedules.length === 0) return null
  const emitSSE = opts.emitSSE !== false

  try {
    const createdAtIso = new Date().toISOString()
    const totalCount = schedules.length
    const items = schedules.slice(0, LIST_CARD_MAX_ITEMS).map((s) => ({
      uuid: s.uuid,
      title: s.payload.title,
      scheduled_at: s.scheduled_at,
      created_at: s.createdAt || createdAtIso,
    }))
    const content: TChatResponse['content'] = [
      {
        type: 'schedule',
        title: SCHEDULE_LIST_CARD_TITLE,
        subtitle: `${totalCount} รายการ`,
        created_at: createdAtIso,
        items,
        item_count: totalCount,
      },
    ]

    const { id, createdAt } = await saveChatBotMessage(userId, content)

    if (emitSSE) {
      const message = mapRawChatToResponse({
        id,
        user_id: userId,
        sender_id: 'bot',
        content,
        created_at: createdAt,
      })
      sseBroker.emit(userId, { type: 'bot_message', message })
    }
    logger.info(
      { userId, chatId: id, scheduleCount: items.length, emitSSE },
      '[chat] pushed bot schedule_list message (firestore + maybe SSE)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot schedule_list message')
    return null
  }
}
