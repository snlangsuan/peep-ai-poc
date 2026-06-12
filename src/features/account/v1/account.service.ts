import { getLocalTime } from '#/common/utils/datetime.util'

import type { AccountRepository } from '#/features/account/v1/account.repository'
import type { IAccountMonthEntity, TAccountMonthResponse } from '#/features/account/v1/account.type'
import type { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import type { IExpenseEntity } from '#/features/expenses/v1/expense.type'

/** Net contribution of a transaction to the balance: income adds, expense subtracts. */
function netOf(txn: IExpenseEntity): number {
  const amount = txn.amount || 0
  return (txn.type ?? 'expense') === 'income' ? amount : -amount
}

export class AccountService {
  constructor(
    private readonly accountRepo: AccountRepository,
    private readonly expenseRepo: ExpenseRepository,
  ) {}

  /** The current local month in 'YYYY-MM' form. */
  currentMonth(): string {
    return getLocalTime().format('YYYY-MM')
  }

  /**
   * Computes the full balance picture for a month: opening balance (carried over from the
   * previous month, or a manual override), income/expense totals, net, and closing balance.
   *
   * Carry-over is computed on read by walking forward from the nearest opening-balance
   * override at or before the target month. When no override exists, the baseline is 0 and
   * the opening balance is the cumulative net of every transaction before the month.
   */
  async getBalance(userId: string, month?: string): Promise<TAccountMonthResponse> {
    const targetMonth = month ?? this.currentMonth()
    const monthDocs = await this.accountRepo.listByUser(userId)
    const docByMonth = new Map<string, IAccountMonthEntity>(monthDocs.map((d) => [d.month, d]))

    // Nearest month <= target that has a manual opening-balance override (the anchor).
    const anchor = monthDocs
      .filter((d) => d.opening_override !== null && d.month <= targetMonth)
      .sort((a, b) => b.month.localeCompare(a.month))[0]

    // Only transactions from the anchor month onward affect the balance (an override resets
    // the baseline). With no anchor, every transaction up to the target month counts.
    const startDate = anchor ? `${anchor.month}-01` : undefined
    const endDate = getLocalTime(`${targetMonth}-01`).endOf('month').format('YYYY-MM-DD')
    const netByMonth = await this.fetchNetByMonth(userId, startDate, endDate)

    // Opening balance: baseline at the anchor (or 0), plus net of every month strictly before
    // the target month (and at/after the anchor).
    let opening = anchor?.opening_override ?? 0
    for (const [m, net] of netByMonth) {
      if (m < targetMonth && (!anchor || m >= anchor.month)) {
        opening += net
      }
    }

    const targetDoc = docByMonth.get(targetMonth)
    const { incomeTotal, expenseTotal } = await this.fetchMonthTotals(userId, targetMonth)
    const netTotal = incomeTotal - expenseTotal
    const closing = opening + netTotal

    const budget = targetDoc?.budget ?? null
    const budgetRemaining = budget === null ? null : budget - expenseTotal
    const budgetUsedRatio = budget === null || budget === 0 ? null : expenseTotal / budget

    return {
      month: targetMonth,
      opening_balance: round2(opening),
      opening_is_override: anchor?.month === targetMonth,
      income_total: round2(incomeTotal),
      expense_total: round2(expenseTotal),
      net_total: round2(netTotal),
      closing_balance: round2(closing),
      currency: 'THB',
      budget,
      budget_used: round2(expenseTotal),
      budget_remaining: budgetRemaining === null ? null : round2(budgetRemaining),
      budget_used_ratio: budgetUsedRatio === null ? null : round2(budgetUsedRatio),
    }
  }

  /** Sets (or with null, clears) the manual opening balance for a month, then returns the recomputed balance. */
  async setOpeningBalance(
    userId: string,
    month: string,
    openingBalance: number | null,
  ): Promise<TAccountMonthResponse> {
    await this.accountRepo.setOpeningOverride(userId, month, openingBalance)
    return this.getBalance(userId, month)
  }

  /** Sets (or with null, clears) the monthly budget, then returns the recomputed balance. */
  async setBudget(userId: string, month: string, budget: number | null): Promise<TAccountMonthResponse> {
    await this.accountRepo.setBudget(userId, month, budget)
    return this.getBalance(userId, month)
  }

  /** Net amount per 'YYYY-MM' over a date window. */
  private async fetchNetByMonth(
    userId: string,
    startDate: string | undefined,
    endDate: string,
  ): Promise<Map<string, number>> {
    const { data } = await this.expenseRepo.list(userId, {
      start_date: startDate,
      end_date: endDate,
      page: 1,
      limit: 1_000_000,
      sort: 'date',
      desc: false,
    })
    const netByMonth = new Map<string, number>()
    for (const txn of data) {
      const m = (txn.date ?? '').slice(0, 7)
      if (!m) continue
      netByMonth.set(m, (netByMonth.get(m) ?? 0) + netOf(txn))
    }
    return netByMonth
  }

  /** Income and expense totals for a single month. */
  private async fetchMonthTotals(
    userId: string,
    month: string,
  ): Promise<{ incomeTotal: number; expenseTotal: number }> {
    const monthRef = getLocalTime(`${month}-01`)
    const { data } = await this.expenseRepo.list(userId, {
      start_date: monthRef.startOf('month').format('YYYY-MM-DD'),
      end_date: monthRef.endOf('month').format('YYYY-MM-DD'),
      page: 1,
      limit: 1_000_000,
      sort: 'date',
      desc: false,
    })
    let incomeTotal = 0
    let expenseTotal = 0
    for (const txn of data) {
      if ((txn.type ?? 'expense') === 'income') incomeTotal += txn.amount || 0
      else expenseTotal += txn.amount || 0
    }
    return { incomeTotal, expenseTotal }
  }
}

/** Round to 2 decimals to keep currency math free of floating-point dust. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
