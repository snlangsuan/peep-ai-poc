import { getLocalTime } from '#/common/utils/datetime.util'
import { horoscopeItemResponseSchema } from '#/features/horoscopes/v1/horoscope.schema'

import type { Bindings, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { HoroscopeService } from '#/features/horoscopes/v1/horoscope.service'
import type { THoroscopeFilterPayload, THoroscopeItemResponse } from '#/features/horoscopes/v1/horoscope.type'
import type { Context } from 'hono'

export class HoroscopeController {
  private service: HoroscopeService

  constructor(service: HoroscopeService) {
    this.service = service
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<THoroscopeFilterPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const query = c.req.valid('query')
    // Default to today's date in Bangkok local time when not provided.
    const date = query.date || getLocalTime().format('YYYY-MM-DD')

    // `sign` is validated by the enum, so it can be passed straight through.
    const items = await this.service.getByDate(date, query.sign)

    return c.json<THoroscopeItemResponse>(
      horoscopeItemResponseSchema.parse({
        items,
        metadata: { date, count: items.length },
      }),
    )
  }
}
