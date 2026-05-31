import { z } from 'zod'

import { successResponseSchema } from '#/common/schemas/response.schema'
import { pushBotExpenseCreatedMessage } from '#/features/chats/v1/expense-notify.helper'
import { expenseResponseSchema, expenseItemResponseSchema } from '#/features/expenses/v1/expense.schema'

import type { Bindings, JsonInputSchema, ParamInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { TSuccessResponse } from '#/common/types/response.type'
import type { ExpenseService } from '#/features/expenses/v1/expense.service'
import type {
  TExpenseCreatePayload,
  TExpenseFilterPayload,
  TExpenseResponse,
  TExpenseUpdatePayload,
  TExpenseParamPayload,
  TExpenseItemResponse,
} from '#/features/expenses/v1/expense.type'
import type { Context } from 'hono'

export class ExpenseController {
  private service: ExpenseService

  constructor(service: ExpenseService) {
    this.service = service
  }

  create = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TExpenseCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')
    const result = await this.service.create(userId, body)

    const created = Array.isArray(result) ? result : [result]
    void pushBotExpenseCreatedMessage(userId, created)

    if (Array.isArray(result)) {
      return c.json<TExpenseResponse[]>(z.array(expenseResponseSchema).parse(result))
    }
    return c.json<TExpenseResponse>(expenseResponseSchema.parse(result))
  }

  get = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TExpenseParamPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    const result = await this.service.getExpense(userId, id)
    return c.json<TExpenseResponse>(expenseResponseSchema.parse(result))
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TExpenseFilterPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const query = c.req.valid('query')
    const result = await this.service.getExpenses(userId, query)
    return c.json<TExpenseItemResponse>(expenseItemResponseSchema.parse(result))
  }

  update = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TExpenseParamPayload> & JsonInputSchema<TExpenseUpdatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const updated = await this.service.update(userId, id, body)

    void pushBotExpenseCreatedMessage(userId, [updated])

    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
  }

  delete = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TExpenseParamPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    await this.service.delete(userId, id)
    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
  }
}
