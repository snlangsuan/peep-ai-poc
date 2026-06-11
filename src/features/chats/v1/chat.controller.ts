import { streamSSE } from 'hono/streaming'

import { logger } from '#/common/libs/logger.lib'
import { successResponseSchema } from '#/common/schemas/response.schema'
import { sseBroker } from '#/common/services/sse-broker.service'
import { chatItemResponseSchema } from '#/features/chats/v1/chat.schema'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { createMoodCardChat, pushBotMoodResultMessage } from '#/features/chats/v1/mood-card.helper'
import { getCurrentSessionId, startNewSession } from '#/features/chats/v1/chat-session.helper'
import { pushDailyFortune } from '#/features/chats/v1/fortune-card.helper'
import { pushMonthlySummary } from '#/features/chats/v1/summary-card.helper'
import { db } from '#/common/libs/firebase.lib'
import { getUtcTime, getLocalTime } from '#/common/utils/datetime.util'
import { SendDailyBriefingModule } from '#/worker/schedule/modules/send-daily-briefing.module'

import type { Bindings, JsonInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { TSuccessResponse } from '#/common/types/response.type'
import type { ChatService } from '#/features/chats/v1/chat.service'
import type { TChatCreatePayload, TChatFilterPayload, TChatItemResponse, TChatActionPayload, TChatMoodUpdatePayload, TChatMoodLinkQuery, TChatMoodSendPayload, TChatFeedbackPayload } from '#/features/chats/v1/chat.type'
import type { Context } from 'hono'

/** Shared instance for the manual daily-briefing test trigger. */
const dailyBriefingModule = new SendDailyBriefingModule()

export class ChatController {
  constructor(private readonly service: ChatService) {}

  /**
   * Manual trigger to send the morning daily-briefing toast to the authenticated user
   * right now (the same flow the 08:00 cron runs). For testing/ops — emits over SSE only.
   */
  triggerDailyBriefing = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends Record<string, never>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    // How many SSE connections are currently open for this user. 0 → the toast would be
    // dropped (the client isn't connected, or connected as a different user/api-key).
    const subscribers = sseBroker.subscriberCount(userId)

    // Uses MOCK counts so a full toast (with quick replies) is always emitted for testing,
    // regardless of the user's real data. Override via ?schedules=&todos=.
    const schedules = this.parsePositiveInt(c.req.query('schedules'), 3)
    const todos = this.parsePositiveInt(c.req.query('todos'), 5)
    const result = await dailyBriefingModule.sendMockToUser(userId, schedules, todos)

    return c.json({ success: true, subscribers, mock: { schedules, todos }, ...result })
  }

  /** Parses a non-negative integer query value, falling back to `fallback`. */
  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const n = Number(value)
    return Number.isInteger(n) && n >= 0 ? n : fallback
  }

  send = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')

    // "/clear" is a command, not a message: start a fresh session and skip the agent.
    if (this.isClearCommand(body.content)) {
      const sessionId = await startNewSession(userId)
      sseBroker.emit(userId, { type: 'session_cleared', session_id: sessionId })
      return c.json({ success: true, session_id: sessionId })
    }

    await this.service.send(userId, body.content)
    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
  }

  /** A message is the "/clear" command when it is a single text part equal to "/clear". */
  private isClearCommand(content: TChatCreatePayload['content']): boolean {
    if (!Array.isArray(content) || content.length !== 1) return false
    const [part] = content
    return part?.type === 'text' && typeof part.text === 'string' && part.text.trim() === '/clear'
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TChatFilterPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const query = c.req.valid('query')
    const limit = query.limit
    const sessionId = await getCurrentSessionId(userId)
    const rawItems = await this.service.list(userId, limit, sessionId)

    const items = rawItems.map((item) => mapRawChatToResponse(item))

    return c.json<TChatItemResponse>(
      chatItemResponseSchema.parse({
        items,
        metadata: {
          total: items.length,
          count: items.length,
          page: 1,
          limit,
        },
      }),
    )
  }

  stream = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends Record<string, never>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')

    return streamSSE(c, async (stream) => {
      let unsubscribe: (() => void) | null = null

      const cleanup = () => {
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }
      }

      unsubscribe = sseBroker.subscribe(userId, async (event) => {
        await stream.writeSSE({
          data: JSON.stringify(event),
          event: event.type,
        })
      })

      stream.onAbort(cleanup)

      await stream.sleep(24 * 60 * 60 * 1000)

      cleanup()
    })
  }

  triggerAction = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatActionPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')
    const action = body.action

    // Fortune-telling is handled directly (no LLM turn): check the saved
    // birthdate, then either ask for it or push today's fortune card.
    if (action === 'fortune-telling') {
      const status = await pushDailyFortune(userId)
      return c.json<TSuccessResponse>(successResponseSchema.parse({ success: true, status }))
    }

    // Monthly summary is also handled directly: build this month's summary card
    // and push it via SSE + Firestore.
    if (action === 'summary') {
      await pushMonthlySummary(userId)
      return c.json<TSuccessResponse>(successResponseSchema.parse({ success: true }))
    }

    let promptText = ''
    switch (action) {
      case 'expense':
        promptText = 'ขอดูรายการค่าใช้จ่ายของวันนี้ให้หน่อยนะจ๊ะ'
        break
      case 'schedule':
        promptText = 'ขอดูรายการกำหนดการของวันนี้ให้หน่อยจ้า'
        break
      case 'todo':
        promptText = 'ขอดูรายการสิ่งที่ต้องทำของวันนี้ให้หน่อยนะจ๊ะ'
        break
      case 'mood':
        promptText = 'ช่วยสรุปอารมณ์ (mood) ของผมในช่วง 7 วันล่าสุดให้หน่อยนะจ๊ะ'
        break
    }

    const jobId = await this.service.send(userId, [
      {
        type: 'text' as const,
        text: promptText,
      },
    ])

    return c.json<TSuccessResponse>(
      successResponseSchema.parse({
        success: true,
        jobId,
      }),
    )
  }

  updateMood = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatMoodUpdatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')
    const { messageId, mood } = body

    const dateStr = getLocalTime().format('YYYY-MM-DD')
    const now = getUtcTime().toDate()

    // 1. If it's a landing page direct update
    if (messageId && messageId.startsWith('landing')) {
      // Validate duplicates for today
      const existingQuery = await db.collection('user_moods')
        .where('user_id', '==', userId)
        .where('date', '==', dateStr)
        .limit(1)
        .get()

      if (!existingQuery.empty) {
        return c.json({ error: 'วันนี้คุณบันทึกอารมณ์ไปแล้ว ☁️✨' }, 400)
      }

      // Add to user_moods directly
      const moodDocRef = db.collection('user_moods').doc()
      await moodDocRef.set({
        uuid: moodDocRef.id,
        user_id: userId,
        mood,
        note: null,
        date: dateStr,
        created_at: now,
      })

      return c.json<TSuccessResponse>(
        successResponseSchema.parse({
          success: true,
          message: 'อัปเดตอารมณ์เรียบร้อยแล้ว',
        }),
      )
    }

    // 2. Normal flow for chat message bubble mood card
    const docRef = db.collection('chats').doc(messageId)
    const doc = await docRef.get()

    if (!doc.exists) {
      return c.json({ error: 'Chat message not found.' }, 404)
    }

    const data = doc.data()
    if (data?.user_id !== userId) {
      return c.json({ error: 'You do not have permission to update this message.' }, 403)
    }

    const content = Array.isArray(data.content) ? (data.content as Array<{ type?: string }>) : []
    const hasMoodCard = content.some((c) => c?.type === 'mood_card')
    if (!hasMoodCard) {
      return c.json({ error: 'Message is not a mood card.' }, 400)
    }

    if (data.mood_used === true) {
      return c.json({ error: 'You have already submitted your mood for this card.' }, 400)
    }

    await docRef.update({
      mood_used: true,
      mood_selected: mood,
      mood_selected_at: now,
    })

    const moodDocRef = db.collection('user_moods').doc()
    await moodDocRef.set({
      uuid: moodDocRef.id,
      user_id: userId,
      mood,
      note: null,
      date: dateStr,
      created_at: now,
    })

    return c.json<TSuccessResponse>(
      successResponseSchema.parse({
        success: true,
        message: 'อัปเดตอารมณ์เรียบร้อยแล้วจ้า!',
      }),
    )
  }

  sendMoodCard = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatMoodSendPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const { to } = c.req.valid('json')
    await Promise.all(to.map((userId) => createMoodCardChat(userId)))
    return c.json<TSuccessResponse>(successResponseSchema.parse({ success: true }))
  }

  recordMoodByLink = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TChatMoodLinkQuery>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const { option, sid } = c.req.valid('query')
    logger.info({ option, sid }, '[mood-link] click received')

    const snapshot = await db.collection('chats').where('mood_sid', '==', sid).limit(1).get()
    if (snapshot.empty) {
      logger.info({ sid }, '[mood-link] sid not found in chats collection')
      return c.json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว ☁️' }, 404)
    }

    const doc = snapshot.docs[0]!
    const now = getUtcTime().toDate()

    // Atomic claim: read-check-update inside a transaction so concurrent
    // requests for the same sid can't both pass the `mood_used` check.
    const claim = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref)
      const freshData = fresh.data()
      if (!freshData) return { status: 'gone' as const }
      if (freshData.mood_used === true) {
        return { status: 'already_used' as const, userId: freshData.user_id as string }
      }
      tx.update(doc.ref, {
        mood_used: true,
        mood_selected: option,
        mood_selected_at: now,
      })
      return { status: 'claimed' as const, userId: freshData.user_id as string }
    })

    if (claim.status === 'gone') {
      logger.info({ sid }, '[mood-link] doc disappeared during transaction')
      return c.json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว ☁️' }, 404)
    }
    if (claim.status === 'already_used') {
      logger.info({ sid, userId: claim.userId, option }, '[mood-link] already used — skip push')
      return c.json({ error: 'คุณบันทึกอารมณ์จากการ์ดใบนี้ไปแล้ว ☁️✨' }, 409)
    }

    logger.info({ sid, userId: claim.userId, option }, '[mood-link] claimed, will generate + push reply')

    const userId = claim.userId
    const dateStr = getLocalTime().format('YYYY-MM-DD')

    const moodDocRef = db.collection('user_moods').doc()
    await moodDocRef.set({
      uuid: moodDocRef.id,
      user_id: userId,
      mood: option,
      note: null,
      date: dateStr,
      created_at: now,
    })

    await pushBotMoodResultMessage(userId, {
      emotion: option,
      note: null,
      createdAt: now,
    })

    return c.json<TSuccessResponse>(
      successResponseSchema.parse({
        success: true,
        message: 'บันทึกอารมณ์เรียบร้อยแล้ว ขอบคุณ ☁️',
      }),
    )
  }

  updateFeedback = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatFeedbackPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')
    const { messageId, feedback } = body

    const docRef = db.collection('chats').doc(messageId)
    const doc = await docRef.get()

    if (!doc.exists) {
      return c.json({ error: 'Chat message not found.' }, 404)
    }

    const data = doc.data()
    if (data?.user_id !== userId) {
      return c.json({ error: 'You do not have permission to update this message.' }, 403)
    }

    await docRef.update({
      feedback: feedback || null,
    })

    return c.json<TSuccessResponse>(
      successResponseSchema.parse({
        success: true,
        message: 'อัปเดต feedback เรียบร้อยแล้ว',
      }),
    )
  }
}

