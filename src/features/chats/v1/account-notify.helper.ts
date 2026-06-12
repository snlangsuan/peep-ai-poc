import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { sseBroker } from '#/common/services/sse-broker.service'
import { getCurrentSessionId } from '#/features/chats/v1/chat-session.helper'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'

import type { TAccountMonthResponse } from '#/features/account/v1/account.type'
import type { TChatResponse } from '#/features/chats/v1/chat.type'
import type { IPushBotChatResult, IPushBotOptions } from '#/features/chats/v1/schedule-notify.helper'

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

/** Pushes a `balance` card summarizing a month's opening/closing balance and budget usage. */
export async function pushBotBalanceMessage(
  userId: string,
  balance: TAccountMonthResponse,
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  const emitSSE = opts.emitSSE !== false

  try {
    const createdAtIso = new Date().toISOString()
    const content: TChatResponse['content'] = [
      {
        type: 'balance',
        created_at: createdAtIso,
        month: balance.month,
        opening_balance: balance.opening_balance,
        income_total: balance.income_total,
        expense_total: balance.expense_total,
        net_total: balance.net_total,
        closing_balance: balance.closing_balance,
        opening_is_override: balance.opening_is_override,
        currency: balance.currency,
        budget: balance.budget,
        budget_used_ratio: balance.budget_used_ratio,
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
      { userId, chatId: id, month: balance.month, closing: balance.closing_balance, emitSSE },
      '[chat] pushed bot balance message (firestore + maybe SSE)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot balance message')
    return null
  }
}
