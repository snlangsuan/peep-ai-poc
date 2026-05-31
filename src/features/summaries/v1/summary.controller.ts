import { summaryMonthlyResponseSchema } from '#/features/summaries/v1/summary.schema'

import type { Bindings, JsonInputSchema, Variables } from '#/common/types/app.type'
import type { SummaryService } from '#/features/summaries/v1/summary.service'
import type { TSummaryMonthlyPayload, TSummaryMonthlyResponse } from '#/features/summaries/v1/summary.type'
import type { Context } from 'hono'

export class SummaryController {
  constructor(private readonly service: SummaryService) {}

  monthly = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TSummaryMonthlyPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { year, month } = c.req.valid('json')
    const result = await this.service.getMonthly(userId, year, month)
    return c.json<TSummaryMonthlyResponse>(summaryMonthlyResponseSchema.parse(result))
  }
}
