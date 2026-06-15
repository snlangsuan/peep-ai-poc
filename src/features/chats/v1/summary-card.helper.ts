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
import { resolvePeriod } from '#/features/summaries/v1/summary.period'
import { SummaryService } from '#/features/summaries/v1/summary.service'
import { TodoRepository } from '#/features/todos/v1/todo.repository'

import type { TChatResponse } from '#/features/chats/v1/chat.type'
import type { IPeriodInput } from '#/features/summaries/v1/summary.period'

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
 * Builds the summary chat content for a user over a period (named or explicit
 * range). Defaults to the current month (Asia/Bangkok). Does NOT save or emit —
 * callers decide delivery.
 */
export async function resolveSummary(
  userId: string,
  input: IPeriodInput = {},
): Promise<TChatResponse['content']> {
  const period = resolvePeriod(input)
  const result = await buildSummaryService().getByPeriod(userId, input)

  // No activity at all in the period → drop filler highlights (keep the card clean).
  const hasData =
    result.todo_count > 0 ||
    result.schedule_count > 0 ||
    result.expense_count > 0 ||
    result.mood.length > 0
  if (!hasData) result.highlight = []

  const title = `สรุปภาพรวม ${period.label}`

  return [
    { type: 'text', text: title },
    {
      type: 'monthly-summary',
      created_at: getUtcTime().toISOString(),
      period: period.key,
      // month/year only for a full calendar month; omitted otherwise.
      ...(period.isFullMonth
        ? { month: String(period.month).padStart(2, '0'), year: String(period.year) }
        : {}),
      start_date: result.start_date,
      end_date: result.end_date,
      title,
      content: result,
    },
  ]
}

/**
 * Backward-compatible monthly wrapper. Defaults to the current month when no
 * year/month is given.
 */
export async function resolveMonthlySummary(
  userId: string,
  year?: number,
  month?: number,
): Promise<TChatResponse['content']> {
  const input: IPeriodInput =
    year && month
      ? {
          start_date: `${year}-${String(month).padStart(2, '0')}-01`,
          end_date: getLocalTime(`${year}-${String(month).padStart(2, '0')}-01`).endOf('month').format('YYYY-MM-DD'),
        }
      : { period: 'this_month' }
  return resolveSummary(userId, input)
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
