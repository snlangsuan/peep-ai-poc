import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { sseBroker } from '#/common/services/sse-broker.service'
import { getCurrentSessionId } from '#/features/chats/v1/chat-session.helper'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { LIST_CARD_MAX_ITEMS } from '#/features/chats/v1/schedule-notify.helper'

import type { TChatResponse } from '#/features/chats/v1/chat.type'
import type { IPushBotChatResult, IPushBotOptions } from '#/features/chats/v1/schedule-notify.helper'
import type { TExpenseResponse } from '#/features/expenses/v1/expense.type'

const EXPENSE_SAVED_TEXT = 'บันทึกค่าใช้จ่ายเรียบร้อยแล้ว'
const EXPENSE_CARD_TITLE = 'รายการค่าใช้จ่าย'
const EXPENSE_LIST_CARD_TITLE = 'รายการค่าใช้จ่าย'

/** Sum income vs expense amounts and the resulting net (income − expense). */
function splitTotals(expenses: TExpenseResponse[]): { incomeTotal: number; expenseTotal: number; net: number } {
  let incomeTotal = 0
  let expenseTotal = 0
  for (const e of expenses) {
    if ((e.type ?? 'expense') === 'income') incomeTotal += e.amount ?? 0
    else expenseTotal += e.amount ?? 0
  }
  return { incomeTotal, expenseTotal, net: incomeTotal - expenseTotal }
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
      kind: e.type ?? 'expense',
      category: e.category,
      date: e.date,
      created_at: e.created_at || createdAtIso,
    }))
    const { incomeTotal, expenseTotal, net } = splitTotals(expenses)
    const content: TChatResponse['content'] = [
      { type: 'text', text: EXPENSE_SAVED_TEXT },
      {
        type: 'expense',
        title: EXPENSE_CARD_TITLE,
        subtitle: `${items.length} รายการ`,
        created_at: createdAtIso,
        items,
        total: net,
        income_total: incomeTotal,
        expense_total: expenseTotal,
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
      { userId, chatId: id, expenseCount: items.length, net, emitSSE },
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
    const totalCount = input.expenses.length
    // Totals are summed over ALL records, not just the displayed slice.
    const { incomeTotal, expenseTotal, net } = splitTotals(input.expenses)
    const items = input.expenses.slice(0, LIST_CARD_MAX_ITEMS).map((e) => ({
      uuid: e.uuid,
      subject: e.subject,
      amount: e.amount,
      kind: e.type ?? 'expense',
      category: e.category,
      date: e.date,
      created_at: e.created_at || createdAtIso,
    }))
    const content: TChatResponse['content'] = [
      {
        type: 'expense',
        title: EXPENSE_LIST_CARD_TITLE,
        subtitle: `${totalCount} รายการ`,
        created_at: createdAtIso,
        items,
        total: net,
        income_total: incomeTotal,
        expense_total: expenseTotal,
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
      sseBroker.emit(userId, { type: 'done', message })
    }
    logger.info(
      { userId, chatId: id, expenseCount: items.length, net, emitSSE },
      '[chat] pushed bot expense_list message (firestore + maybe SSE)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot expense_list message')
    return null
  }
}

/**
 * Pushes a category-grouped expense summary card (`expense_summary`).
 * `expenses` must already be the FULL set for the period (not a paginated slice) so
 * `total` and per-category sums are accurate. Returns null when there are no expenses.
 */
export async function pushBotExpenseSummaryMessage(
  userId: string,
  input: { expenses: TExpenseResponse[]; startDate: string; endDate: string },
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  if (input.expenses.length === 0) return null
  const emitSSE = opts.emitSSE !== false

  try {
    const { incomeTotal, expenseTotal, net } = splitTotals(input.expenses)
    // Per-category breakdown is split by direction so income and expense never net each other out.
    const summary: Record<string, number> = {}
    const incomeSummary: Record<string, number> = {}
    for (const e of input.expenses) {
      if ((e.type ?? 'expense') === 'income') {
        incomeSummary[e.category] = (incomeSummary[e.category] ?? 0) + (e.amount ?? 0)
      } else {
        summary[e.category] = (summary[e.category] ?? 0) + (e.amount ?? 0)
      }
    }

    const content: TChatResponse['content'] = [
      {
        type: 'expense_summary',
        // `total` stays the headline expense figure for backward compatibility with old clients.
        total: expenseTotal,
        income_total: incomeTotal,
        expense_total: expenseTotal,
        net_total: net,
        start_date: input.startDate,
        end_date: input.endDate,
        summary,
        ...(Object.keys(incomeSummary).length > 0 ? { income_summary: incomeSummary } : {}),
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
      { userId, chatId: id, expenseTotal, incomeTotal, categories: Object.keys(summary).length, emitSSE },
      '[chat] pushed bot expense_summary message (firestore + maybe SSE)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot expense_summary message')
    return null
  }
}
