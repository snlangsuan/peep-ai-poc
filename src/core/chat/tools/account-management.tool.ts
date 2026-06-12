import { AccountRepository } from '#/features/account/v1/account.repository'
import { AccountService } from '#/features/account/v1/account.service'
import { pushBotBalanceMessage } from '#/features/chats/v1/account-notify.helper'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'

import type { TAccountMonthResponse } from '#/features/account/v1/account.type'
import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export class AccountManagementTool implements IChatTool {
  readonly name = 'manage_account'
  readonly description =
    'จัดการบัญชีเงินคงเหลือของผู้ใช้: ดู "ยอดเงินคงเหลือ/เงินต้น/ยอดยกมา" และ "สรุปบัญชี" รายเดือน (opening + รายรับ − รายจ่าย = closing), ตั้ง "เงินต้น" ของเดือน (set_balance), และตั้ง "งบประมาณรายเดือน/budget" (set_budget). ใช้ tool นี้ (ไม่ใช่ summary_tool) ทุกครั้งที่ผู้ใช้พูดถึง เงินคงเหลือ, เหลือเงินเท่าไหร่, สรุปบัญชี, ยอดเงิน, เงินต้น, ยอดยกมา, หรือ งบเดือนนี้'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        description:
          'การดำเนินการ: "balance" (ดูยอดคงเหลือของเดือน), "set_balance" (ตั้งเงินต้น/opening balance ของเดือน), "set_budget" (ตั้งหรือยกเลิกงบประมาณรายเดือน)',
      },
      month: {
        type: 'STRING',
        description: 'เดือนที่ต้องการ รูปแบบ YYYY-MM (เช่น 2026-06). ถ้าไม่ระบุจะใช้เดือนปัจจุบัน',
      },
      amount: {
        type: 'NUMBER',
        description: 'ใช้กับ "set_balance": จำนวนเงินต้น/ยอดเงินคงเหลือต้นเดือนที่ต้องการตั้ง (เช่น 10000)',
      },
      budget: {
        type: 'NUMBER',
        description: 'ใช้กับ "set_budget": วงเงินงบประมาณของเดือน (เช่น 20000)',
      },
      clear: {
        type: 'BOOLEAN',
        description: 'ใช้กับ "set_budget": ตั้งเป็น true เพื่อ "ยกเลิก/ลบ" งบประมาณของเดือนนั้น',
      },
    },
    required: ['action'],
  }

  private service: AccountService

  constructor() {
    this.service = new AccountService(new AccountRepository(), new ExpenseRepository())
  }

  async execute(
    args: {
      action: 'balance' | 'set_balance' | 'set_budget'
      month?: string
      amount?: number
      budget?: number
      clear?: boolean
    },
    context: IChatContext,
  ): Promise<string> {
    const userId = context.userId
    const month = args.month && MONTH_RE.test(args.month) ? args.month : this.service.currentMonth()

    try {
      switch (args.action) {
        case 'balance':
          return await this.respondWithBalance(userId, await this.service.getBalance(userId, month))
        case 'set_balance':
          return await this.handleSetBalance(userId, month, args.amount)
        case 'set_budget':
          return await this.handleSetBudget(userId, month, args.budget, args.clear)
        default:
          return JSON.stringify({ error: `Unsupported action: "${args.action}"` })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong while managing the account.'
      return JSON.stringify({ error: message })
    }
  }

  private async handleSetBalance(userId: string, month: string, amount?: number): Promise<string> {
    if (typeof amount !== 'number') {
      return JSON.stringify({ error: 'Missing required field: "amount" is required for set_balance.' })
    }
    const result = await this.service.setOpeningBalance(userId, month, amount)
    return this.respondWithBalance(
      userId,
      result,
      `ตั้งเงินต้นเดือน ${month} เป็น ${amount.toLocaleString()} บาทแล้วจ้า!`,
    )
  }

  private async handleSetBudget(userId: string, month: string, budget?: number, clear?: boolean): Promise<string> {
    if (!clear && typeof budget !== 'number') {
      return JSON.stringify({ error: 'Missing required field: "budget" (or clear=true) is required for set_budget.' })
    }
    const next = clear ? null : budget!
    const result = await this.service.setBudget(userId, month, next)
    const msg =
      next === null
        ? `ยกเลิกงบประมาณเดือน ${month} แล้วจ้า!`
        : `ตั้งงบประมาณเดือน ${month} เป็น ${next.toLocaleString()} บาทแล้วจ้า!`
    return this.respondWithBalance(userId, result, msg)
  }

  /** Pushes the balance card and tells the agent to skip its own response so the user sees one card. */
  private async respondWithBalance(userId: string, balance: TAccountMonthResponse, message?: string): Promise<string> {
    const saved = await pushBotBalanceMessage(userId, balance, { emitSSE: false })
    const savedForAgentDone = saved
      ? { id: saved.id, content: saved.content, createdAt: saved.createdAt.toISOString() }
      : undefined

    return JSON.stringify({
      ...(message ? { message } : {}),
      balance,
      // Human-readable hint so the agent narrates carry-over correctly when it does respond.
      explanation: this.describe(balance),
      ...(savedForAgentDone ? { __suppress_agent_response: true, __agent_saved_message: savedForAgentDone } : {}),
    })
  }

  private describe(b: TAccountMonthResponse): string {
    const carry = b.opening_is_override
      ? `เงินต้นเดือนนี้ตั้งเองไว้ที่ ${b.opening_balance.toLocaleString()} บาท`
      : `ยอดยกมาจากเดือนก่อน ${b.opening_balance.toLocaleString()} บาท`
    let budgetPart = ''
    if (b.budget !== null) {
      const pct = Math.round((b.budget_used_ratio ?? 0) * 100)
      const over = (b.budget_used_ratio ?? 0) > 1 ? ' — ใช้เกินงบแล้ว' : ''
      budgetPart = ` งบเดือนนี้ ${b.budget.toLocaleString()} บาท ใช้ไป ${b.expense_total.toLocaleString()} (${pct}%)${over}`
    }
    const overdraft = b.closing_balance < 0 ? ' (ยอดติดลบ ระวังใช้เกินตัว)' : ''
    return `${carry} + รายรับ ${b.income_total.toLocaleString()} − รายจ่าย ${b.expense_total.toLocaleString()} = คงเหลือ ${b.closing_balance.toLocaleString()} บาท${overdraft}${budgetPart}`
  }
}
