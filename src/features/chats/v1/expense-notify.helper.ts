import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { sseBroker } from '#/common/services/sse-broker.service'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'

import type { TExpenseResponse } from '#/features/expenses/v1/expense.type'
import type { IPushBotChatResult, IPushBotOptions } from '#/features/chats/v1/schedule-notify.helper'
import type { TChatResponse } from '#/features/chats/v1/chat.type'

const EXPENSE_SAVED_TEXT = 'บันทึกค่าใช้จ่ายเรียบร้อยแล้ว'
const EXPENSE_CARD_TITLE = 'รายการค่าใช้จ่าย'
const EXPENSE_LIST_CARD_TITLE = 'รายการค่าใช้จ่าย'

async function saveChatBotMessage(
  userId: string,
  content: TChatResponse['content'],
): Promise<{ id: string; createdAt: Date }> {
  const docRef = db.collection('chats').doc()
  const createdAt = new Date()
  await docRef.set({
    user_id: userId,
    sender_id: 'bot',
    content,
    feedback: null,
    error: null,
    created_at: createdAt,
  })
  return { id: docRef.id, createdAt }
}

export async function pushBotExpenseCreatedMessage(
  userId: string,
  expenses: TExpenseResponse[],
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  if (expenses.length === 0) return null
  const emitSSE = opts.emitSSE !== false

  try {
    const createdAtIso = new Date().toISOString()
    const items = expenses.map((e) => ({
      uuid: e.uuid,
      subject: e.subject,
      amount: e.amount,
      category: e.category,
      date: e.date,
      created_at: e.created_at || createdAtIso,
    }))
    const total = items.reduce((sum, it) => sum + (it.amount ?? 0), 0)
    const content: TChatResponse['content'] = [
      { type: 'text', text: EXPENSE_SAVED_TEXT },
      {
        type: 'expense',
        title: EXPENSE_CARD_TITLE,
        subtitle: `${items.length} รายการ`,
        created_at: createdAtIso,
        items,
        total,
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
      { userId, chatId: id, expenseCount: items.length, total, emitSSE },
      '[chat] pushed bot expense_saved message (firestore + maybe SSE done)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot expense_saved message')
    return null
  }
}

export interface IPushBotExpenseListInput {
  expenses: TExpenseResponse[]
  startDate: string
  endDate: string
}

export async function pushBotExpenseListMessage(
  userId: string,
  input: IPushBotExpenseListInput,
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  if (input.expenses.length === 0) return null
  const emitSSE = opts.emitSSE !== false

  try {
    const createdAtIso = new Date().toISOString()
    const items = input.expenses.map((e) => ({
      uuid: e.uuid,
      subject: e.subject,
      amount: e.amount,
      category: e.category,
      date: e.date,
      created_at: e.created_at || createdAtIso,
    }))
    const total = items.reduce((sum, it) => sum + (it.amount ?? 0), 0)
    const content: TChatResponse['content'] = [
      {
        type: 'expense',
        title: EXPENSE_LIST_CARD_TITLE,
        subtitle: `${items.length} รายการ`,
        created_at: createdAtIso,
        items,
        total,
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
      { userId, chatId: id, expenseCount: items.length, total, emitSSE },
      '[chat] pushed bot expense_list message (firestore + maybe SSE)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot expense_list message')
    return null
  }
}
