import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { sseBroker } from '#/common/services/sse-broker.service'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { getCurrentSessionId } from '#/features/chats/v1/chat-session.helper'
import { LIST_CARD_MAX_ITEMS } from '#/features/chats/v1/schedule-notify.helper'

import type { TTodoResponse } from '#/features/todos/v1/todo.type'
import type { IPushBotChatResult, IPushBotOptions } from '#/features/chats/v1/schedule-notify.helper'
import type { TChatResponse } from '#/features/chats/v1/chat.type'

const TODO_SAVED_TEXT = 'บันทึกรายการ Todo List เรียบร้อยแล้ว'
const TODO_CARD_TITLE = 'รายการ Todo List'
const TODO_LIST_CARD_TITLE = 'รายการ Todo List'

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

export async function pushBotTodoSavedMessage(
  userId: string,
  todos: TTodoResponse[],
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  if (todos.length === 0) return null
  const emitSSE = opts.emitSSE !== false

  try {
    const createdAtIso = new Date().toISOString()
    const items = todos.map((t) => ({
      uuid: t.uuid,
      title: t.title,
      completed: t.completed,
      created_at: t.created_at || createdAtIso,
    }))
    const content: TChatResponse['content'] = [
      { type: 'text', text: TODO_SAVED_TEXT },
      {
        type: 'todo',
        title: TODO_CARD_TITLE,
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
      { userId, chatId: id, todoCount: items.length, emitSSE },
      '[chat] pushed bot todo_saved message (firestore + maybe SSE done)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot todo_saved message')
    return null
  }
}

export async function pushBotTodoListMessage(
  userId: string,
  todos: TTodoResponse[],
  opts: IPushBotOptions = {},
): Promise<IPushBotChatResult | null> {
  if (todos.length === 0) return null
  const emitSSE = opts.emitSSE !== false

  try {
    const createdAtIso = new Date().toISOString()
    const totalCount = todos.length
    const items = todos.slice(0, LIST_CARD_MAX_ITEMS).map((t) => ({
      uuid: t.uuid,
      title: t.title,
      completed: t.completed,
      created_at: t.created_at || createdAtIso,
    }))
    const content: TChatResponse['content'] = [
      {
        type: 'todo',
        title: TODO_LIST_CARD_TITLE,
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
      sseBroker.emit(userId, { type: 'done', message })
    }
    logger.info(
      { userId, chatId: id, todoCount: items.length, emitSSE },
      '[chat] pushed bot todo_list message (firestore + maybe SSE)',
    )
    return { id, content, createdAt }
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot todo_list message')
    return null
  }
}
