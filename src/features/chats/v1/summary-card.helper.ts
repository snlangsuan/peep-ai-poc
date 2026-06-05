import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { AIService } from '#/common/services/ai.service'
import { sseBroker } from '#/common/services/sse-broker.service'
import { getLocalTime, getUtcTime } from '#/common/utils/datetime.util'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { getCurrentSessionId } from '#/features/chats/v1/chat-session.helper'
import { pushBotTextMessage } from '#/features/chats/v1/mood-card.helper'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import { MoodRepository } from '#/features/moods/v1/mood.repository'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import { SummaryService } from '#/features/summaries/v1/summary.service'
import { TodoRepository } from '#/features/todos/v1/todo.repository'

import type { TChatResponse } from '#/features/chats/v1/chat.type'

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export const SUMMARY_UNAVAILABLE_MESSAGE = 'ตอนนี้สรุปภาพรวมให้ไม่ได้ ลองใหม่อีกครั้งในภายหลัง'

export interface ISavedSummaryMessage {
  id: string
  content: TChatResponse['content']
  createdAt: Date
}

function buildSummaryService(): SummaryService {
  return new SummaryService(
    new TodoRepository(),
    new ScheduleRepository(),
    new ExpenseRepository(),
    new MoodRepository(),
    new AIService(),
  )
}

/**
 * Builds the monthly-summary chat content for a user. Defaults to the current
 * month (Asia/Bangkok). Does NOT save or emit — callers decide delivery.
 */
export async function resolveMonthlySummary(
  userId: string,
  year?: number,
  month?: number,
): Promise<TChatResponse['content']> {
  const now = getLocalTime()
  const y = year ?? now.year()
  const m = month ?? now.month() + 1 // dayjs month() is 0-indexed

  const result = await buildSummaryService().getMonthly(userId, y, m)

  // No activity at all this month → drop filler highlights (keep the card clean).
  const hasData =
    result.todo_count > 0 ||
    result.schedule_count > 0 ||
    result.expense_count > 0 ||
    result.mood.length > 0
  if (!hasData) result.highlight = []

  const title = `สรุปภาพรวม ประจำเดือน${THAI_MONTHS[m - 1]} ${y}`

  return [
    { type: 'text', text: title },
    {
      type: 'monthly-summary',
      created_at: getUtcTime().toISOString(),
      month: String(m).padStart(2, '0'),
      year: String(y),
      title,
      content: result,
    },
  ]
}

/**
 * Persists a monthly-summary chat message (bot) into Firestore, stamped with the
 * current session. Optionally emits the SSE `done` event. Returns the saved
 * message so the chat agent can reuse it.
 */
export async function saveSummaryChat(
  userId: string,
  content: TChatResponse['content'],
  options: { emitSSE?: boolean } = {},
): Promise<ISavedSummaryMessage> {
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
 * builds the monthly summary and pushes it via SSE + Firestore.
 */
export async function pushMonthlySummary(userId: string, year?: number, month?: number): Promise<boolean> {
  try {
    const content = await resolveMonthlySummary(userId, year, month)
    await saveSummaryChat(userId, content, { emitSSE: true })
    return true
  } catch (error) {
    logger.error({ error, userId }, '[summary] failed to push monthly summary')
    await pushBotTextMessage(userId, SUMMARY_UNAVAILABLE_MESSAGE)
    return false
  }
}
