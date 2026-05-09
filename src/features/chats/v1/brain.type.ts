import type { TExpenseResponse, TExpenseListResponse } from '#/features/expenses/v1/expense.type'
import type { TScheduleResponse, TScheduleListResponse } from '#/features/schedules/v1/schedule.type'

export type TToolResult =
  | TExpenseResponse
  | TExpenseListResponse
  | TScheduleResponse
  | TScheduleListResponse
  | { expenses: TExpenseListResponse; schedules: TScheduleListResponse }
  | string
  | null

export interface IExpenseArgs {
  action: 'create' | 'list' | 'update'
  id?: string
  subject?: string
  amount?: number
  currency?: string
  location?: string
  category?: string
  date?: string
}

export interface IScheduleArgs {
  action: 'create' | 'list' | 'update'
  id?: string
  title?: string
  location?: string
  date?: string
  time?: string
  remind_before_minutes?: number
}

export interface ISummaryArgs {
  start_date?: string
  end_date?: string
}
