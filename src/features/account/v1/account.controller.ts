import { accountMonthResponseSchema } from '#/features/account/v1/account.schema'

import type { Bindings, JsonInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { AccountService } from '#/features/account/v1/account.service'
import type {
  TAccountMonthResponse,
  TBalanceQuery,
  TSetBudgetPayload,
  TSetOpeningBalancePayload,
} from '#/features/account/v1/account.type'
import type { Context } from 'hono'

export class AccountController {
  private service: AccountService

  constructor(service: AccountService) {
    this.service = service
  }

  getBalance = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TBalanceQuery>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { month } = c.req.valid('query')
    const result = await this.service.getBalance(userId, month)
    return c.json<TAccountMonthResponse>(accountMonthResponseSchema.parse(result))
  }

  setOpeningBalance = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TSetOpeningBalancePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { month, opening_balance } = c.req.valid('json')
    const result = await this.service.setOpeningBalance(userId, month, opening_balance)
    return c.json<TAccountMonthResponse>(accountMonthResponseSchema.parse(result))
  }

  setBudget = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TSetBudgetPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { month, budget } = c.req.valid('json')
    const result = await this.service.setBudget(userId, month, budget)
    return c.json<TAccountMonthResponse>(accountMonthResponseSchema.parse(result))
  }
}
