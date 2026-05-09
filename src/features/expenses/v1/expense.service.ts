import type { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import type {
  TCreateExpense,
  TExpenseListFilter,
  TExpenseListResponse,
  TExpenseResponse,
} from '#/features/expenses/v1/expense.type'

export class ExpenseService {
  constructor(private readonly expenseRepository: ExpenseRepository) {}

  async create(user_id: string, data: TCreateExpense): Promise<TExpenseResponse> {
    return this.expenseRepository.create(user_id, data)
  }

  async list(user_id: string, filter: TExpenseListFilter): Promise<TExpenseListResponse> {
    return this.expenseRepository.list(user_id, filter)
  }

  async get(user_id: string, id: string): Promise<TExpenseResponse | null> {
    return this.expenseRepository.getById(user_id, id)
  }

  async update(user_id: string, id: string, data: Partial<TCreateExpense>): Promise<TExpenseResponse | null> {
    return this.expenseRepository.update(user_id, id, data)
  }

  async delete(user_id: string, id: string): Promise<boolean> {
    return this.expenseRepository.delete(user_id, id)
  }
}
