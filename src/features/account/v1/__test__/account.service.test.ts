import { describe, expect, it, beforeEach } from 'bun:test'

import { AccountService } from '#/features/account/v1/account.service'

import type { AccountRepository } from '#/features/account/v1/account.repository'
import type { IAccountMonthEntity } from '#/features/account/v1/account.type'
import type { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import type { IExpenseEntity } from '#/features/expenses/v1/expense.type'

const USER = 'user-1'

function txn(date: string, type: 'income' | 'expense', amount: number): IExpenseEntity {
  return {
    uuid: `${date}-${type}-${amount}`,
    created_by: USER,
    subject: `${type} ${amount}`,
    amount,
    type,
    category: type === 'income' ? 'salary' : 'other',
    currency: 'THB',
    location: null,
    date,
    time: null,
    created_at: `${date}T00:00:00Z`,
    updated_at: `${date}T00:00:00Z`,
  }
}

describe('AccountService balance & carry-over', () => {
  let txns: IExpenseEntity[]
  let months: Record<string, IAccountMonthEntity>
  let service: AccountService

  beforeEach(() => {
    txns = []
    months = {}

    const expenseRepo = {
      list: async (
        _userId: string,
        filter: { start_date?: string; end_date?: string },
      ): Promise<{ data: IExpenseEntity[]; total: number }> => {
        const data = txns.filter((t) => {
          if (filter.start_date && t.date < filter.start_date) return false
          if (filter.end_date && t.date > filter.end_date) return false
          return true
        })
        return { data, total: data.length }
      },
    } as unknown as ExpenseRepository

    const accountRepo = {
      listByUser: async (): Promise<IAccountMonthEntity[]> => Object.values(months),
      setOpeningOverride: async (userId: string, month: string, openingOverride: number | null): Promise<void> => {
        months[month] = {
          ...(months[month] ?? { user_id: userId, month, budget: null, updated_at: '' }),
          opening_override: openingOverride,
        }
      },
      setBudget: async (userId: string, month: string, budget: number | null): Promise<void> => {
        months[month] = {
          ...(months[month] ?? { user_id: userId, month, opening_override: null, updated_at: '' }),
          budget,
        }
      },
    } as unknown as AccountRepository

    service = new AccountService(accountRepo, expenseRepo)
  })

  it('computes opening=0 when there is no anchor and no prior activity', async (): Promise<void> => {
    const b = await service.getBalance(USER, '2026-04')
    expect(b.opening_balance).toBe(0)
    expect(b.closing_balance).toBe(0)
    expect(b.opening_is_override).toBe(false)
  })

  it('computes net = income − expense and closing = opening + net', async (): Promise<void> => {
    months['2026-04'] = { user_id: USER, month: '2026-04', opening_override: 10000, budget: null, updated_at: '' }
    txns.push(txn('2026-04-05', 'income', 20000), txn('2026-04-10', 'expense', 18000))

    const b = await service.getBalance(USER, '2026-04')
    expect(b.opening_balance).toBe(10000)
    expect(b.income_total).toBe(20000)
    expect(b.expense_total).toBe(18000)
    expect(b.net_total).toBe(2000)
    expect(b.closing_balance).toBe(12000)
    expect(b.opening_is_override).toBe(true)
  })

  it('carries the closing balance forward to the next month automatically', async (): Promise<void> => {
    months['2026-04'] = { user_id: USER, month: '2026-04', opening_override: 10000, budget: null, updated_at: '' }
    txns.push(
      txn('2026-04-05', 'income', 20000),
      txn('2026-04-10', 'expense', 18000), // closing 04 = 12000
      txn('2026-05-05', 'income', 20000),
      txn('2026-05-20', 'expense', 25000), // net 05 = -5000
    )

    const may = await service.getBalance(USER, '2026-05')
    expect(may.opening_balance).toBe(12000) // carried from April
    expect(may.net_total).toBe(-5000)
    expect(may.closing_balance).toBe(7000)
    expect(may.opening_is_override).toBe(false)
  })

  it('carries across an empty month (no transactions) without losing the balance', async (): Promise<void> => {
    months['2026-04'] = { user_id: USER, month: '2026-04', opening_override: 10000, budget: null, updated_at: '' }
    txns.push(txn('2026-04-10', 'income', 5000)) // closing 04 = 15000, May empty

    const jun = await service.getBalance(USER, '2026-06')
    expect(jun.opening_balance).toBe(15000)
    expect(jun.closing_balance).toBe(15000)
  })

  it('lets a later override re-anchor the running balance', async (): Promise<void> => {
    months['2026-04'] = { user_id: USER, month: '2026-04', opening_override: 10000, budget: null, updated_at: '' }
    months['2026-06'] = { user_id: USER, month: '2026-06', opening_override: 8000, budget: null, updated_at: '' }
    txns.push(
      txn('2026-04-05', 'income', 20000),
      txn('2026-04-10', 'expense', 18000),
      txn('2026-05-20', 'expense', 99999), // before the June anchor → must NOT affect June
      txn('2026-06-15', 'expense', 1000),
    )

    const jun = await service.getBalance(USER, '2026-06')
    expect(jun.opening_balance).toBe(8000) // override wins, prior months ignored
    expect(jun.opening_is_override).toBe(true)
    expect(jun.closing_balance).toBe(7000)
  })

  it('treats records with no type as expenses (backward compatibility)', async (): Promise<void> => {
    const legacy = txn('2026-04-10', 'expense', 500)
    // Simulate an old record that predates the type field.
    delete (legacy as { type?: string }).type
    txns.push(legacy)

    const b = await service.getBalance(USER, '2026-04')
    expect(b.expense_total).toBe(500)
    expect(b.closing_balance).toBe(-500)
  })

  it('reports budget usage and remaining', async (): Promise<void> => {
    await service.setBudget(USER, '2026-04', 20000)
    txns.push(txn('2026-04-10', 'expense', 5000))

    const b = await service.getBalance(USER, '2026-04')
    expect(b.budget).toBe(20000)
    expect(b.budget_used).toBe(5000)
    expect(b.budget_remaining).toBe(15000)
    expect(b.budget_used_ratio).toBe(0.25)
  })

  it('sums income before an anchorless target month into the opening balance', async (): Promise<void> => {
    // No override anywhere → opening of May is the cumulative net of everything before May.
    txns.push(txn('2026-03-01', 'income', 1000), txn('2026-04-01', 'expense', 400))

    const may = await service.getBalance(USER, '2026-05')
    expect(may.opening_balance).toBe(600)
    expect(may.closing_balance).toBe(600)
  })
})
