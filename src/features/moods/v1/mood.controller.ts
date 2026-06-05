import { moodResponseSchema, moodItemResponseSchema } from '#/features/moods/v1/mood.schema'
import { pushBotMoodResultMessage } from '#/features/chats/v1/mood-card.helper'

import type { Bindings, JsonInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { MoodService } from '#/features/moods/v1/mood.service'
import type {
  TMoodCreatePayload,
  TMoodFilterPayload,
  TMoodResponse,
  TMoodItemResponse,
} from '#/features/moods/v1/mood.type'
import type { Context } from 'hono'

export class MoodController {
  private service: MoodService

  constructor(service: MoodService) {
    this.service = service
  }

  create = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TMoodCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')

    // If a mood-card sid is supplied, verify it hasn't been used yet (one mood
    // per card). If already used, reject; otherwise claim it and continue.
    if (body.sid) {
      const claim = await this.service.claimMoodSid(body.sid, userId, body.emotion)
      if (claim.status === 'not_found') {
        return c.json({ error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว ☁️' }, 404)
      }
      if (claim.status === 'forbidden') {
        return c.json({ error: 'คุณไม่มีสิทธิ์ใช้การ์ดใบนี้ ☁️' }, 403)
      }
      if (claim.status === 'already_used') {
        return c.json({ error: 'คุณบันทึกอารมณ์จากการ์ดใบนี้ไปแล้ว ☁️✨' }, 409)
      }
    }

    const result = await this.service.create(userId, body)

    void pushBotMoodResultMessage(userId, {
      emotion: result.emotion,
      note: result.note ?? null,
      createdAt: new Date(result.created_at),
    })

    return c.json<TMoodResponse>(moodResponseSchema.parse(result))
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TMoodFilterPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const query = c.req.valid('query')
    const result = await this.service.getMoods(userId, query)
    return c.json<TMoodItemResponse>(moodItemResponseSchema.parse(result))
  }
}
