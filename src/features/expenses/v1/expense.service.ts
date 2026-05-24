import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import ObjectNotFoundException from '#/common/exceptions/object.not.found.exception'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

import type { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import type {
  IExpenseEntity,
  TExpenseCreatePayload,
  TExpenseFilterPayload,
  TExpenseItemResponse,
  TExpenseResponse,
  TExpenseUpdatePayload,
} from '#/features/expenses/v1/expense.type'

export class ExpenseService {
  private repository: ExpenseRepository

  constructor(repository: ExpenseRepository) {
    this.repository = repository
  }

  async create(userId: string, body: TExpenseCreatePayload): Promise<TExpenseResponse[]> {
    const now = getUtcTime().toISOString()

    const inputs: IExpenseEntity[] = body.expenses.map((item) => ({
      uuid: getUUID(),
      created_by: userId,
      subject: item.subject,
      amount: item.amount,
      category: item.category,
      currency: item.currency ?? 'THB',
      location: item.location ?? null,
      date: item.date,
      time: item.time ?? null,
      created_at: now,
      updated_at: now,
    }))
    const results = await this.repository.createMultiple(inputs)
    return results
  }

  async getExpense(userId: string, uuid: string): Promise<TExpenseResponse> {
    const expense = await this.repository.findById(uuid)

    if (!expense) {
      throw new ObjectNotFoundException('Expense not found.')
    }

    if (expense.created_by !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this expense.')
    }

    return expense
  }

  async getExpenses(userId: string, filter: Partial<TExpenseFilterPayload>): Promise<TExpenseItemResponse> {
    const { data, total } = await this.repository.list(userId, filter)
    const limit = filter.limit ?? 25
    const page = filter.page ?? 1

    return {
      items: data,
      metadata: {
        total,
        count: data.length,
        page,
        limit,
      },
    }
  }

  async update(userId: string, uuid: string, body: TExpenseUpdatePayload): Promise<TExpenseResponse> {
    const expense = await this.repository.findById(uuid)

    if (!expense) {
      throw new ObjectNotFoundException('Expense not found.')
    }

    if (expense.created_by !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this expense.')
    }

    const fields: Partial<IExpenseEntity> = {
      updated_at: getUtcTime().toISOString(),
    }

    if (body.subject !== undefined) {
      fields.subject = body.subject
    }
    if (body.amount !== undefined) {
      fields.amount = body.amount
    }
    if (body.category !== undefined) {
      fields.category = body.category
    }
    if (body.currency !== undefined) {
      fields.currency = body.currency
    }
    if (body.location !== undefined) {
      fields.location = body.location ?? null
    }
    if (body.date !== undefined) {
      fields.date = body.date
    }
    if (body.time !== undefined) {
      fields.time = body.time ?? null
    }

    await this.repository.update(uuid, fields)

    const updated = await this.repository.findById(uuid)
    if (!updated) {
      throw new ObjectNotFoundException('Expense not found after update.')
    }

    return updated
  }

  async delete(userId: string, uuid: string): Promise<void> {
    const expense = await this.repository.findById(uuid)

    if (!expense) {
      throw new ObjectNotFoundException('Expense not found.')
    }

    if (expense.created_by !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this expense.')
    }

    await this.repository.delete(uuid)
  }
}
