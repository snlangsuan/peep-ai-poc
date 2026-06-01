import { parserResponseSchema } from '#/features/parser/v1/parser.schema'

import type { Bindings, JsonInputSchema, Variables } from '#/common/types/app.type'
import type { ParserService } from '#/features/parser/v1/parser.service'
import type { TParserPayload, TParserResponse } from '#/features/parser/v1/parser.type'
import type { Context } from 'hono'

export class ParserController {
  constructor(private readonly service: ParserService) {}

  classify = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TParserPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const { message } = c.req.valid('json')
    const result = await this.service.classify(message)
    return c.json<TParserResponse>(parserResponseSchema.parse(result))
  }
}
