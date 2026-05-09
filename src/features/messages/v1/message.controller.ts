import type { MessageService } from '#/features/messages/v1/message.service'
import type { Bindings, JsonInputSchema, Variables } from '#/common/types/app.type'
import type { TExtractMessageResponse, TExtractMessageRequestBodyPayload } from '#/features/messages/v1/message.type'
import type { Context } from 'hono'
import { extractMessageResponseSchema } from './message.schema'

export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  extract = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TExtractMessageRequestBodyPayload>,
  >(
    c: Context<E, P, I>,
  ) => {
    const { message, date } = c.req.valid('json')
    const items = await this.messageService.extractMessage(message, date)
    return c.json<TExtractMessageResponse>(extractMessageResponseSchema.parse({ items }))
  }
}
