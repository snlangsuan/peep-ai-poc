import type { Bindings, JsonInputSchema, ParamInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { ExpenseService } from '#/features/expenses/v1/expense.service'
import type {
  TCreateExpense,
  TExpenseIdParam,
  TExpenseListFilter,
  TExpenseListResponse,
  TExpenseResponse,
  TUpdateExpense,
} from '#/features/expenses/v1/expense.type'
import type { Context } from 'hono'

import {
  expenseListResponseSchema,
  expenseResponseSchema,
} from '#/features/expenses/v1/expense.schema'

export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  create = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TCreateExpense>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const data = c.req.valid('json')

    const result = await this.expenseService.create(apiKey as string, data)

    return c.json<TExpenseResponse>(expenseResponseSchema.parse(result), 201)
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TExpenseListFilter>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const filter = c.req.valid('query')

    const result = await this.expenseService.list(apiKey as string, filter)

    return c.json<TExpenseListResponse>(expenseListResponseSchema.parse(result))
  }

  get = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TExpenseIdParam>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { id } = c.req.valid('param')

    const result = await this.expenseService.get(apiKey as string, id)
    if (!result) return c.json({ error: 'Expense not found' }, 404)

    return c.json<TExpenseResponse>(expenseResponseSchema.parse(result))
  }

  update = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TExpenseIdParam> & JsonInputSchema<TUpdateExpense>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const result = await this.expenseService.update(apiKey as string, id, data)
    if (!result) return c.json({ error: 'Expense not found' }, 404)

    return c.json<TExpenseResponse>(expenseResponseSchema.parse(result))
  }

  delete = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TExpenseIdParam>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { id } = c.req.valid('param')

    const success = await this.expenseService.delete(apiKey as string, id)
    if (!success) return c.json({ error: 'Expense not found' }, 404)

    return c.json({ success: true })
  }
}
