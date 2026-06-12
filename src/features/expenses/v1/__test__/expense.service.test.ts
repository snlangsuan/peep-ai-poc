import { describe, expect, it, mock, beforeEach } from 'bun:test'

import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import ObjectNotFoundException from '#/common/exceptions/object.not.found.exception'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import { ExpenseService } from '#/features/expenses/v1/expense.service'

import type { IExpenseEntity } from '#/features/expenses/v1/expense.type'

describe('ExpenseService Unit Tests', () => {
  let mockExpensesDb: Record<string, IExpenseEntity>
  let mockExpenseRepository: ExpenseRepository
  let service: ExpenseService

  beforeEach(() => {
    mockExpensesDb = {
      'expense-1': {
        uuid: 'expense-1',
        created_by: 'user-uuid-1',
        subject: 'Office Supplies',
        amount: 1500,
        type: 'expense',
        category: 'other',
        currency: 'THB',
        location: 'Store A',
        date: '2026-05-23',
        time: '14:30:00',
        created_at: '2026-05-22T08:00:00Z',
        updated_at: '2026-05-22T08:00:00Z',
      },
    }

    mockExpenseRepository = {
      create: mock(async (input: IExpenseEntity): Promise<IExpenseEntity> => {
        mockExpensesDb[input.uuid] = input
        return input
      }),
      createMultiple: mock(async (inputs: IExpenseEntity[]): Promise<IExpenseEntity[]> => {
        for (const input of inputs) {
          mockExpensesDb[input.uuid] = input
        }
        return inputs
      }),
      findById: mock(async (uuid: string): Promise<IExpenseEntity | null> => {
        return mockExpensesDb[uuid] || null
      }),
      list: mock(async (userId: string, filter: any): Promise<{ data: IExpenseEntity[]; total: number }> => {
        const list = Object.values(mockExpensesDb).filter((t) => t.created_by === userId)
        return {
          data: list,
          total: list.length,
        }
      }),
      update: mock(async (uuid: string, fields: any): Promise<void> => {
        if (mockExpensesDb[uuid]) {
          mockExpensesDb[uuid] = { ...mockExpensesDb[uuid], ...fields }
        }
      }),
      delete: mock(async (uuid: string): Promise<void> => {
        delete mockExpensesDb[uuid]
      }),
    } as unknown as ExpenseRepository

    service = new ExpenseService(mockExpenseRepository)
  })

  it('should create a single expense successfully', async (): Promise<void> => {
    const result = await service.create('user-uuid-1', {
      expenses: [
        {
          subject: 'Coffee',
          amount: 120,
          type: 'expense',
          category: 'other',
          currency: 'THB',
          date: '2026-05-23',
        },
      ],
    })

    const singleResult = result[0]!
    expect(singleResult).toBeDefined()
    expect(singleResult.uuid).toBeDefined()
    expect(singleResult.created_by).toBe('user-uuid-1')
    expect(singleResult.subject).toBe('Coffee')
    expect(singleResult.amount).toBe(120)
    expect(singleResult.category).toBe('other')
    expect(singleResult.currency).toBe('THB')
    expect(singleResult.date).toBe('2026-05-23')
  })

  it('should create multiple expenses successfully', async (): Promise<void> => {
    const result = await service.create('user-uuid-1', {
      expenses: [
        {
          subject: 'Coffee',
          amount: 120,
          type: 'expense',
          category: 'other',
          currency: 'THB',
          date: '2026-05-23',
        },
        {
          subject: 'Lunch',
          amount: 350,
          type: 'expense',
          category: 'other',
          currency: 'THB',
          date: '2026-05-23',
        },
      ],
    })

    const multipleResult = result as IExpenseEntity[]
    expect(Array.isArray(multipleResult)).toBe(true)
    expect(multipleResult.length).toBe(2)
    expect(multipleResult[0]?.subject).toBe('Coffee')
    expect(multipleResult[1]?.subject).toBe('Lunch')
  })

  it('should retrieve single expense belonging to user', async (): Promise<void> => {
    const result = await service.getExpense('user-uuid-1', 'expense-1')

    expect(result.uuid).toBe('expense-1')
    expect(result.subject).toBe('Office Supplies')
    expect(result.amount).toBe(1500)
  })

  it('should throw ObjectNotFoundException when retrieving missing expense', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.getExpense('user-uuid-1', 'missing-expense')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when user is not owner', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.getExpense('user-uuid-2', 'expense-1')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })

  it('should retrieve user expenses list with metadata', async (): Promise<void> => {
    const result = await service.getExpenses('user-uuid-1', {
      page: 1,
      limit: 10,
      sort: 'date',
      desc: true,
    })

    expect(result.items.length).toBe(1)
    expect(result.metadata.total).toBe(1)
    expect(result.metadata.page).toBe(1)
    expect(result.metadata.limit).toBe(10)
  })

  it('should update expense successfully', async (): Promise<void> => {
    const result = await service.update('user-uuid-1', 'expense-1', {
      subject: 'New Office Supplies',
      amount: 1800,
    })

    expect(result.uuid).toBe('expense-1')
    expect(result.subject).toBe('New Office Supplies')
    expect(result.amount).toBe(1800)
  })

  it('should throw ObjectNotFoundException when updating missing expense', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.update('user-uuid-1', 'missing-expense', {
        subject: 'Review',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when updating expense of another user', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.update('user-uuid-2', 'expense-1', {
        subject: 'Stolen',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })

  it('should delete expense successfully', async (): Promise<void> => {
    await service.delete('user-uuid-1', 'expense-1')
    expect(mockExpensesDb['expense-1']).toBeUndefined()
  })

  it('should throw ObjectNotFoundException when deleting missing expense', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.delete('user-uuid-1', 'missing-expense')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when deleting expense of another user', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.delete('user-uuid-2', 'expense-1')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })
})
