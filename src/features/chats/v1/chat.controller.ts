import type { Bindings, JsonInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { ChatService } from '#/features/chats/v1/chat.service'
import type {
  TChatActionRequestBodyPayload,
  TChatListFilter,
  TChatListResponse,
  TChatResponse,
  TChatStreamFilter,
  TSendMessage,
} from '#/features/chats/v1/chat.type'
import type { Context } from 'hono'

import { streamSSE } from 'hono/streaming'
import {
  chatListResponseSchema,
  chatResponseSchema,
  chatResponseWithContentSchema,
} from '#/features/chats/v1/chat.schema'
import InsufficientPermissionException from '~/src/common/exceptions/insufficient.permission.exception'

export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  send = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TSendMessage>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const data = c.req.valid('json')

    try {
      const result = await this.chatService.send(apiKey as string, data)
      return c.json<TChatResponse>(chatResponseSchema.parse(result), 201)
    } catch (error) {
      if (error instanceof Error && error.message === 'OUT_OF_CREDITS') {
        throw new InsufficientPermissionException('เครดิตของคุณหมดแล้ว กรุณาเติมเครดิตเพื่อใช้งานต่อ')
      }
      throw error
    }
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TChatListFilter>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const filter = c.req.valid('query')

    const result = await this.chatService.list(apiKey as string, filter)

    return c.json<TChatListResponse>(chatListResponseSchema.parse(result))
  }

  stream = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TChatStreamFilter>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')

    return streamSSE(c, async (stream) => {
      // Send initial credit balance
      const initialProfile = await this.chatService.getProfile(apiKey as string)
      if (initialProfile) {
        await stream.writeSSE({
          data: JSON.stringify({ credits: initialProfile.credits }),
          event: 'credit_balance',
        })
      }

      const unsubscribe = this.chatService.subscribe(apiKey as string, async (message) => {
        const { credits, ...rest } = message
        // Send message event
        await stream.writeSSE({
          data: JSON.stringify(chatResponseWithContentSchema.parse(rest)),
          event: 'message',
          id: message.id,
        })

        // Also send credit_balance event if credits are available in the message
        if (credits !== undefined) {
          await stream.writeSSE({
            data: JSON.stringify({ credits }),
            event: 'credit_balance',
          })
        }
      })

      stream.onAbort(() => {
        unsubscribe()
      })

      // Keep connection alive
      while (true) {
        await stream.sleep(30000)
        await stream.writeSSE({
          event: 'ping',
          id: Date.now().toString(),
          data: '',
        })
      }
    })
  }

  actionExpenses = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatActionRequestBodyPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { start_date, end_date } = c.req.valid('json')
    try {
      await this.chatService.handleAction(apiKey as string, 'expenses', { start_date, end_date })
      return c.json({ success: true }, 201)
    } catch (error) {
      if (error instanceof Error && error.message === 'OUT_OF_CREDITS') {
        throw new InsufficientPermissionException('เครดิตของคุณหมดแล้ว กรุณาเติมเครดิตเพื่อใช้งานต่อ')
      }
      throw error
    }
  }

  actionSchedules = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatActionRequestBodyPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { start_date, end_date } = c.req.valid('json')
    try {
      await this.chatService.handleAction(apiKey as string, 'schedules', { start_date, end_date })
      return c.json({ success: true }, 201)
    } catch (error) {
      if (error instanceof Error && error.message === 'OUT_OF_CREDITS') {
        throw new InsufficientPermissionException('เครดิตของคุณหมดแล้ว กรุณาเติมเครดิตเพื่อใช้งานต่อ ครับ')
      }
      throw error
    }
  }

  actionOverallSummary = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TChatActionRequestBodyPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { start_date, end_date } = c.req.valid('json')
    try {
      await this.chatService.handleAction(apiKey as string, 'overall', { start_date, end_date })
      return c.json({ success: true }, 201)
    } catch (error) {
      if (error instanceof Error && error.message === 'OUT_OF_CREDITS') {
        throw new InsufficientPermissionException('เครดิตของคุณหมดแล้ว กรุณาเติมเครดิตเพื่อใช้งานต่อ')
      }
      throw error
    }
  }
}
