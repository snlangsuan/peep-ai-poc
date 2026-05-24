import { streamSSE } from 'hono/streaming'

import { successResponseSchema } from '#/common/schemas/response.schema'
import { sseBroker } from '#/common/services/sse-broker.service'
import { getUUID } from '#/common/utils/helper.util'
import { chatItemResponseSchema } from '#/features/chats/v1/chat.schema'
import { db } from '#/common/libs/firebase.lib'
import { getUtcTime, getLocalTime } from '#/common/utils/datetime.util'

import type { Bindings, JsonInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { TSuccessResponse } from '#/common/types/response.type'
import type { ChatService } from '#/features/chats/v1/chat.service'
import type { TChatCreatePayload, TChatFilterPayload, TChatItemResponse, TChatActionPayload, TChatMoodUpdatePayload } from '#/features/chats/v1/chat.type'
import type { Context } from 'hono'

export class ChatController {
  constructor(private readonly service: ChatService) {}

  send = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')

    await this.service.send(userId, body.content)
    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
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
    const rawItems = await this.service.list(userId, limit)

    const items = rawItems.map((item) => {
      let content: Array<
        | { type: 'text'; text: string }
        | { type: 'action'; link: string }
        | { type: 'mood_card'; options: string[]; selected_mood: string | null }
      > = [
        {
          type: 'text' as const,
          text: item.message || '',
        },
      ]

      if (item.message) {
        const msgStr = item.message.trim()
        if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
          try {
            const parsed = JSON.parse(msgStr)
            if (parsed.type === 'action' && typeof parsed.link === 'string') {
              content = [
                {
                  type: 'action' as const,
                  link: parsed.link,
                },
              ]
            } else if (parsed.type === 'mood_card' && Array.isArray(parsed.options)) {
              content = [
                {
                  type: 'mood_card' as const,
                  options: parsed.options,
                  selected_mood: parsed.selected_mood ?? null,
                },
              ]
            }
          } catch {}
        } else if (msgStr.startsWith('peep://')) {
          content = [
            {
              type: 'action' as const,
              link: msgStr,
            },
          ]
        }
      }

      return {
        id: item.id || getUUID(),
        sender_id: item.sender_id || 'unknown',
        content,
        created_at:
          typeof item.created_at === 'string'
            ? item.created_at
            : item.created_at?.toISOString() || new Date().toISOString(),
      }
    })

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
      case 'summary':
        promptText = 'ช่วยวิเคราะห์สรุปข้อมูลภาพรวมของโครงการให้หน่อยนะจ๊ะ'
        break
      case 'fortune-telling':
        promptText = 'ช่วยทำนายดวงชะตาให้ผมหน่อยนะจ๊ะ'
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

    const docRef = db.collection('chats').doc(messageId)
    const doc = await docRef.get()

    if (!doc.exists) {
      return c.json({ error: 'Chat message not found.' }, 404)
    }

    const data = doc.data()
    if (data?.user_id !== userId) {
      return c.json({ error: 'You do not have permission to update this message.' }, 403)
    }

    const messageStr = data.message || ''
    if (!messageStr.startsWith('{') || !messageStr.endsWith('}')) {
      return c.json({ error: 'Message is not an interactive card.' }, 400)
    }

    let parsed: any
    try {
      parsed = JSON.parse(messageStr)
    } catch {
      return c.json({ error: 'Failed to parse card data.' }, 400)
    }

    if (parsed.type !== 'mood_card') {
      return c.json({ error: 'Message is not a mood card.' }, 400)
    }

    if (parsed.selected_mood !== null && parsed.selected_mood !== undefined) {
      return c.json({ error: 'You have already submitted your mood for this card.' }, 400)
    }

    parsed.selected_mood = mood
    await docRef.update({
      message: JSON.stringify(parsed),
    })

    const dateStr = getLocalTime().format('YYYY-MM-DD')
    const now = getUtcTime().toDate()
    const moodDocRef = db.collection('user_moods').doc()
    await moodDocRef.set({
      uuid: moodDocRef.id,
      user_id: userId,
      mood,
      note: 'บันทึกอารมณ์ผ่านการกดการ์ดประจำวันจ้า ☁️✨',
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
}

