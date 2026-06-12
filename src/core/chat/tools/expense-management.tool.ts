import { getLocalTime } from '#/common/utils/datetime.util'
import {
  pushBotExpenseCreatedMessage,
  pushBotExpenseListMessage,
  pushBotExpenseSummaryMessage,
} from '#/features/chats/v1/expense-notify.helper'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import { ExpenseService } from '#/features/expenses/v1/expense.service'

import type { TExpenseType, TTransactionCategory } from '#/features/expenses/v1/expense.type'
import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

const EXPENSE_CATEGORIES = ['transport', 'food&drink', 'shopping', 'bills', 'work', 'other'] as const
const INCOME_CATEGORIES = ['salary', 'bonus', 'sale', 'transfer-in', 'refund', 'other-income'] as const

interface IDirectionSplit {
  incomeTotal: number
  expenseTotal: number
  netTotal: number
  expenseSummary: Record<string, number>
  incomeSummary: Record<string, number>
}

/** Split a set of records by direction into totals and per-category breakdowns. */
function splitByDirection(items: Array<{ amount: number; type?: TExpenseType; category: string }>): IDirectionSplit {
  const split: IDirectionSplit = {
    incomeTotal: 0,
    expenseTotal: 0,
    netTotal: 0,
    expenseSummary: {},
    incomeSummary: {},
  }
  for (const e of items) {
    const amount = e.amount || 0
    if ((e.type ?? 'expense') === 'income') {
      split.incomeTotal += amount
      split.incomeSummary[e.category] = (split.incomeSummary[e.category] ?? 0) + amount
    } else {
      split.expenseTotal += amount
      split.expenseSummary[e.category] = (split.expenseSummary[e.category] ?? 0) + amount
    }
  }
  split.netTotal = split.incomeTotal - split.expenseTotal
  return split
}

/** Coerce a loose category string into a valid category for the given direction. */
function normalizeCategory(raw: string, type: TExpenseType): TTransactionCategory {
  let cat = (raw || '').toLowerCase().trim()
  if (type === 'income') {
    if (cat === 'wage' || cat === 'payroll' || cat === 'เงินเดือน') cat = 'salary'
    if (cat === 'transfer' || cat === 'transfer in' || cat === 'deposit') cat = 'transfer-in'
    if (cat === 'selling' || cat === 'sales') cat = 'sale'
    return (INCOME_CATEGORIES as readonly string[]).includes(cat) ? (cat as TTransactionCategory) : 'other-income'
  }
  if (cat === 'food' || cat === 'drink' || cat === 'food & drink') cat = 'food&drink'
  if (cat === 'travel' || cat === 'car' || cat === 'bts' || cat === 'mrt') cat = 'transport'
  return (EXPENSE_CATEGORIES as readonly string[]).includes(cat) ? (cat as TTransactionCategory) : 'other'
}

export class ExpenseManagementTool implements IChatTool {
  readonly name = 'manage_expenses'
  readonly description =
    'จัดการบันทึกค่าใช้จ่าย (Expenses) ของผู้ใช้ ทั้งการสร้าง/บันทึกรายได้-รายจ่าย, เรียกดู, แก้ไขข้อมูล, ลบ, แสดงรายการตามช่วงเวลา และ "สรุปค่าใช้จ่ายแยกตามหมวดหมู่" (เช่น "สรุปค่าใช้จ่ายเดือนนี้", "ขอรายละเอียดค่าใช้จ่าย"). ใช้ tool นี้เสมอเมื่อผู้ใช้พูดถึงค่าใช้จ่าย/รายรับ/รายจ่าย แม้จะเป็นการ "สรุป" ก็ตาม'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        description:
          'การดำเนินการที่ต้องการทำ: "create" (บันทึกรายการใหม่), "get" (เรียกดูรายตัว), "list" (แสดงรายการทีละรายการตามช่วงเวลา), "summary" (สรุปยอดรวมแยกตามหมวดหมู่ตามช่วงเวลา), "update" (แก้ไข), "delete" (ลบ)',
      },
      uuid: {
        type: 'STRING',
        description: 'ไอดีเฉพาะของรายการค่าใช้จ่าย (จำเป็นต้องส่งเมื่อ action เป็น "get", "update", "delete")',
      },
      confirm: {
        type: 'BOOLEAN',
        description:
          'ใช้กับ action "delete" เท่านั้น: ตั้งเป็น true เมื่อผู้ใช้ "ยืนยันแล้ว" ว่าจะลบรายการ. โดยปกติไม่ต้องส่ง (หรือ false) — ระบบจะคืน needs_confirmation พร้อมรายละเอียดรายการให้ถามผู้ใช้ก่อน เมื่อผู้ใช้ยืนยันค่อยเรียก delete ซ้ำพร้อม confirm=true',
      },
      expenses: {
        type: 'ARRAY',
        description:
          'รายการค่าใช้จ่ายที่ต้องการสร้าง (ใช้คู่กับ action "create" เท่านั้น) รองรับการส่งหลายรายการพร้อมกัน',
        items: {
          type: 'OBJECT',
          properties: {
            subject: { type: 'STRING', description: 'หัวข้อหรือชื่อรายการ (เช่น ค่าข้าวมันไก่, เงินเดือน, ขายของ)' },
            amount: {
              type: 'NUMBER',
              description: 'จำนวนเงิน เป็นค่าบวกเสมอ (เช่น 50, 120.50, 20000) — ทิศทางกำหนดด้วย type',
            },
            type: {
              type: 'STRING',
              description:
                'ทิศทางของเงิน: "expense" (รายจ่าย/เงินออก) หรือ "income" (รายรับ/เงินเข้า). ค่าเริ่มต้นเป็น "expense". ต้องระบุให้ถูกตามเจตนาผู้ใช้',
            },
            category: {
              type: 'STRING',
              description:
                'หมวดหมู่. ถ้า type=expense ใช้: food&drink, transport, shopping, bills, work, other. ถ้า type=income ใช้: salary, bonus, sale, transfer-in, refund, other-income',
            },
            currency: { type: 'STRING', description: 'สกุลเงิน (ค่าเริ่มต้นเป็น "THB")' },
            location: { type: 'STRING', description: 'สถานที่ที่จ่ายเงิน' },
            date: { type: 'STRING', description: 'วันที่บันทึก รูปแบบ YYYY-MM-DD (เช่น 2026-05-24)' },
            time: { type: 'STRING', description: 'เวลาที่บันทึก รูปแบบ HH:mm (เช่น 18:30)' },
          },
          required: ['subject', 'amount', 'type', 'category', 'date'],
        },
      },
      subject: {
        type: 'STRING',
        description: 'แก้ไขหัวข้อรายการค่าใช้จ่าย (ใช้กับ action "update")',
      },
      amount: {
        type: 'NUMBER',
        description: 'แก้ไขจำนวนเงิน (ใช้กับ action "update")',
      },
      type: {
        type: 'STRING',
        description: 'แก้ไขทิศทางของเงิน: "income" หรือ "expense" (ใช้กับ action "update")',
      },
      category: {
        type: 'STRING',
        description: 'แก้ไขหมวดหมู่ (ใช้กับ action "update") — ใช้ชุดหมวดตาม type เหมือนตอน create',
      },
      currency: {
        type: 'STRING',
        description: 'แก้ไขสกุลเงิน (ใช้กับ action "update")',
      },
      location: {
        type: 'STRING',
        description: 'แก้ไขสถานที่ (ใช้กับ action "update")',
      },
      date: {
        type: 'STRING',
        description: 'แก้ไขวันที่บันทึก รูปแบบ YYYY-MM-DD (ใช้กับ action "update")',
      },
      time: {
        type: 'STRING',
        description: 'แก้ไขเวลา รูปแบบ HH:mm (ใช้กับ action "update")',
      },
      filter: {
        type: 'OBJECT',
        properties: {
          startDate: { type: 'STRING', description: 'กรองตั้งแต่วันที่ระบุ รูปแบบ YYYY-MM-DD (เช่น 2026-05-23)' },
          endDate: { type: 'STRING', description: 'กรองถึงวันที่ระบุ รูปแบบ YYYY-MM-DD (เช่น 2026-05-23)' },
          page: { type: 'NUMBER', description: 'เลขหน้า (เริ่มต้น 1)' },
          limit: { type: 'NUMBER', description: 'จำนวนรายการที่แสดงต่อหน้า (เริ่มต้น 25)' },
        },
      },
      lookup: {
        type: 'BOOLEAN',
        description:
          'ใช้กับ action "list" เท่านั้น: ตั้งเป็น true เมื่อ list เพื่อ "ค้นหา uuid ภายใน" สำหรับนำไปลบ/แก้ไข (ไม่ใช่เพื่อแสดงให้ผู้ใช้ดู) — ระบบจะไม่ส่งการ์ดรายการให้ผู้ใช้ ป้องกันการขึ้นการ์ดโดยไม่ตั้งใจ',
      },
    },
    required: ['action'],
  }

  private service: ExpenseService

  constructor() {
    this.service = new ExpenseService(new ExpenseRepository())
  }

  async execute(
    args: {
      action: 'create' | 'get' | 'list' | 'summary' | 'update' | 'delete'
      uuid?: string
      confirm?: boolean
      expenses?: Array<{
        subject: string
        amount: number
        type?: string
        category: string
        currency?: string
        location?: string
        date: string
        time?: string
      }>
      subject?: string
      amount?: number
      type?: string
      category?: string
      currency?: string
      location?: string
      date?: string
      time?: string
      filter?: { startDate?: string; endDate?: string; page?: number; limit?: number }
      lookup?: boolean
    },
    context: IChatContext,
  ): Promise<string> {
    let action = args.action
    const userId = context.userId

    // Deterministic guard: the model sometimes picks 'list' for a clear summary request
    // ("สรุป.../ภาพรวม/รายละเอียดค่าใช้จ่าย"). Honor the user's actual intent.
    if (action === 'list' && this.isSummaryIntent(context.message)) {
      action = 'summary'
    }

    // Anti-leakage: in multi-turn chats the model often re-uses the date range from a
    // previous turn (e.g. "3 เดือน") even when the new message specifies no period. If the
    // CURRENT message has no time expression, drop any inherited date filter and let the
    // handler apply its default.
    if ((action === 'list' || action === 'summary') && args.filter && !this.messageSpecifiesPeriod(context.message)) {
      args.filter = { ...args.filter, startDate: undefined, endDate: undefined }
    }

    try {
      switch (action) {
        case 'create':
          return await this.handleCreate(userId, args.expenses)
        case 'get':
          return await this.handleGet(userId, args.uuid)
        case 'list':
          return await this.handleList(userId, args.filter, args.lookup)
        case 'summary':
          return await this.handleSummary(userId, args.filter)
        case 'update':
          return await this.handleUpdate(userId, args)
        case 'delete':
          return await this.handleDelete(userId, args.uuid, args.confirm)
        default:
          return JSON.stringify({ error: `Unsupported action: "${action}"` })
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message || 'Something went wrong while managing expenses.' })
    }
  }

  private async handleCreate(
    userId: string,
    expenses?: Array<{
      subject: string
      amount: number
      type?: string
      category: string
      currency?: string
      location?: string
      date: string
      time?: string
    }>,
  ): Promise<string> {
    if (!expenses || expenses.length === 0) {
      return JSON.stringify({ error: 'Missing required field: "expenses" array must not be empty for create action.' })
    }
    const mappedExpenses = expenses.map((e) => {
      const type = e.type?.toLowerCase().trim() === 'income' ? 'income' : 'expense'
      return {
        subject: e.subject,
        amount: e.amount,
        type: type as 'income' | 'expense',
        category: normalizeCategory(e.category, type),
        currency: e.currency ?? 'THB',
        location: e.location ?? null,
        date: e.date,
        time: e.time ?? null,
      }
    })
    const result = await this.service.create(userId, { expenses: mappedExpenses })

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    if (result.length > 0) {
      const saved = await pushBotExpenseCreatedMessage(userId, result, { emitSSE: false })
      if (saved) {
        savedForAgentDone = {
          id: saved.id,
          content: saved.content,
          createdAt: saved.createdAt.toISOString(),
        }
      }
    }

    return JSON.stringify({
      message:
        result.length === 1
          ? 'บันทึกค่าใช้จ่ายเรียบร้อยแล้วจ้า!'
          : `บันทึกค่าใช้จ่ายเรียบร้อย ${result.length} รายการแล้วจ้า!`,
      items: result,
      ...(savedForAgentDone
        ? {
            __suppress_agent_response: true,
            __agent_saved_message: savedForAgentDone,
          }
        : {}),
    })
  }

  private async handleGet(userId: string, uuid?: string): Promise<string> {
    if (!uuid) {
      return JSON.stringify({ error: 'Missing required field: "uuid" is required for get action.' })
    }
    const result = await this.service.getExpense(userId, uuid)
    return JSON.stringify({ item: result })
  }

  private async handleList(
    userId: string,
    filter?: { startDate?: string; endDate?: string; page?: number; limit?: number },
    lookup?: boolean,
  ): Promise<string> {
    // No date specified at all → default to this month-to-date (a generic "show my
    // expenses" should surface recent items, not just today which is often empty).
    let startDate = filter?.startDate
    let endDate = filter?.endDate
    if (!startDate && !endDate) {
      startDate = getLocalTime().startOf('month').format('YYYY-MM-DD')
      endDate = getLocalTime().format('YYYY-MM-DD')
    }

    const apiFilter = {
      start_date: startDate,
      end_date: endDate,
      page: filter?.page,
      limit: filter?.limit,
    }
    const result = await this.service.getExpenses(userId, apiFilter)

    // Split income vs expense for the queried period so the agent can report a real net.
    const { incomeTotal, expenseTotal, netTotal } = splitByDirection(result.items)

    // If the filter describes a bounded period of <= 31 days and we have items, push
    // a structured expense card to the user (text + expense card) and tell the agent
    // to skip its own done event so the user sees one cohesive message.
    // In lookup mode the agent is only resolving a uuid (e.g. before delete/update),
    // so don't push a list card or suppress the agent's response.
    const withinCardWindow = !!startDate && !!endDate && this.daysBetweenInclusive(startDate, endDate) <= 31
    const shouldPushCard = !lookup && result.items.length > 0 && withinCardWindow

    // Safety net: a wide range can't render an itemized card — the user almost certainly
    // wanted a summary. Nudge the agent to re-call with action='summary'.
    const suggestSummary = !lookup && result.items.length > 0 && !withinCardWindow

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    if (shouldPushCard) {
      const saved = await pushBotExpenseListMessage(
        userId,
        {
          expenses: result.items,
          startDate: startDate!,
          endDate: endDate!,
        },
        { emitSSE: false },
      )
      if (saved) {
        savedForAgentDone = {
          id: saved.id,
          content: saved.content,
          createdAt: saved.createdAt.toISOString(),
        }
      }
    }

    return JSON.stringify({
      total: result.metadata.total,
      count: result.metadata.count,
      page: result.metadata.page,
      limit: result.metadata.limit,
      items: result.items,
      // `total_amount` keeps its legacy meaning (total spent) for backward compatibility.
      total_amount: expenseTotal,
      income_total: incomeTotal,
      expense_total: expenseTotal,
      net_total: netTotal,
      period: {
        start: startDate || 'all',
        end: endDate || 'all',
      },
      ...(suggestSummary
        ? {
            __hint_use_summary:
              'ช่วงเวลากว้างเกิน 31 วัน ระบบไม่แสดงการ์ดรายการแยกชิ้น — ถ้าผู้ใช้ต้องการดูค่าใช้จ่ายในช่วงนี้ ให้เรียก action="summary" ด้วยช่วงเวลาเดียวกันเพื่อแสดงสรุปยอดแยกตามหมวดหมู่',
          }
        : {}),
      ...(savedForAgentDone
        ? {
            __suppress_agent_response: true,
            __agent_saved_message: savedForAgentDone,
          }
        : {}),
    })
  }

  /** True when the user's message clearly asks for a summary rather than an itemized list. */
  private isSummaryIntent(message?: string): boolean {
    if (!message) return false
    const keywords = ['สรุป', 'ภาพรวม', 'รวมยอด', 'รายละเอียด', 'ใช้เงินไปกับ', 'ใช้จ่ายไปกับ']
    return keywords.some((k) => message.includes(k))
  }

  /** True when the message itself names a time period (so a date filter is intended this turn). */
  private messageSpecifiesPeriod(message?: string): boolean {
    if (!message) return false
    return /วันนี้|เมื่อวาน|พรุ่งนี้|มะรืน|สัปดาห์|อาทิตย์|เดือน|ไตรมาส|ปีนี้|ปีที่แล้ว|ทั้งปี|ย้อนหลัง|ที่ผ่านมา|ที่แล้ว|ตั้งแต่|ช่วง|มกรา|กุมภา|มีนา|เมษา|พฤษภา|มิถุนา|กรกฎา|สิงหา|กันยา|ตุลา|พฤศจิ|ธันวา|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}|\d+\s*(วัน|เดือน|ปี|สัปดาห์|อาทิตย์)/.test(
      message,
    )
  }

  /**
   * Summarizes expenses grouped by category over a period (card type `expense_summary`).
   * - No date given → defaults to current month-to-date.
   * - Period is capped at 1 year; longer ranges are rejected with a message.
   * - No expenses → returns a text-only result so the agent tells the user the period is empty.
   */
  private async handleSummary(userId: string, filter?: { startDate?: string; endDate?: string }): Promise<string> {
    // Default to today when the user didn't specify a period (a bare "สรุปค่าใช้จ่าย"
    // means today's spending, not an inherited multi-month range).
    let startDate = filter?.startDate
    let endDate = filter?.endDate
    if (!startDate && !endDate) {
      startDate = endDate = getLocalTime().format('YYYY-MM-DD')
    } else if (startDate && !endDate) {
      endDate = startDate
    } else if (!startDate && endDate) {
      startDate = endDate
    }

    // Cap the summary window at 1 year.
    if (this.daysBetweenInclusive(startDate!, endDate!) > 366) {
      return JSON.stringify({
        status: 'invalid_range',
        period: { start: startDate, end: endDate },
        message: 'ช่วงเวลาที่สรุปได้สูงสุดไม่เกิน 1 ปี แจ้งผู้ใช้ให้ระบุช่วงเวลาที่สั้นลง (ไม่เกิน 1 ปี)',
      })
    }

    // Fetch ALL expenses in the period (high limit) so totals are accurate, not page-limited.
    const result = await this.service.getExpenses(userId, {
      start_date: startDate,
      end_date: endDate,
      page: 1,
      limit: 100000,
    })

    const period = { start: startDate!, end: endDate! }

    if (result.items.length === 0) {
      return JSON.stringify({
        status: 'empty',
        period,
        message: `ไม่มีรายการค่าใช้จ่ายในช่วง ${period.start} ถึง ${period.end} — แจ้งผู้ใช้ว่าไม่มีรายการในช่วงเวลานี้`,
      })
    }

    const {
      incomeTotal,
      expenseTotal,
      netTotal,
      expenseSummary: summary,
      incomeSummary,
    } = splitByDirection(result.items)

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    const saved = await pushBotExpenseSummaryMessage(
      userId,
      { expenses: result.items, startDate: startDate!, endDate: endDate! },
      { emitSSE: false },
    )
    if (saved) {
      savedForAgentDone = {
        id: saved.id,
        content: saved.content,
        createdAt: saved.createdAt.toISOString(),
      }
    }

    return JSON.stringify({
      // `total` keeps its legacy meaning (total spent) for backward compatibility.
      total: expenseTotal,
      income_total: incomeTotal,
      expense_total: expenseTotal,
      net_total: netTotal,
      summary,
      ...(Object.keys(incomeSummary).length > 0 ? { income_summary: incomeSummary } : {}),
      item_count: result.items.length,
      period,
      ...(savedForAgentDone
        ? {
            __suppress_agent_response: true,
            __agent_saved_message: savedForAgentDone,
          }
        : {}),
    })
  }

  /** Days between two YYYY-MM-DD dates, inclusive. Returns Infinity on parse failure. */
  private daysBetweenInclusive(start: string, end: string): number {
    const s = Date.parse(start)
    const e = Date.parse(end)
    if (Number.isNaN(s) || Number.isNaN(e)) return Number.POSITIVE_INFINITY
    return Math.floor((e - s) / 86400000) + 1
  }

  private async handleUpdate(
    userId: string,
    args: {
      uuid?: string
      subject?: string
      amount?: number
      type?: string
      category?: string
      currency?: string
      location?: string
      date?: string
      time?: string
    },
  ): Promise<string> {
    const { uuid, subject, amount, currency, location, date, time } = args
    if (!uuid) {
      return JSON.stringify({ error: 'Missing required field: "uuid" is required for update action.' })
    }
    const type = args.type ? (args.type.toLowerCase().trim() === 'income' ? 'income' : 'expense') : undefined
    // When category is edited, normalize it against the (possibly newly-set) direction.
    const category = args.category !== undefined ? normalizeCategory(args.category, type ?? 'expense') : undefined
    const result = await this.service.update(userId, uuid, {
      subject,
      amount,
      type,
      category,
      currency,
      location,
      date,
      time,
    })

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    const saved = await pushBotExpenseCreatedMessage(userId, [result], { emitSSE: false })
    if (saved) {
      savedForAgentDone = {
        id: saved.id,
        content: saved.content,
        createdAt: saved.createdAt.toISOString(),
      }
    }

    return JSON.stringify({
      message: 'แก้ไขรายการค่าใช้จ่ายสำเร็จแล้วจ้า!',
      item: result,
      ...(savedForAgentDone
        ? {
            __suppress_agent_response: true,
            __agent_saved_message: savedForAgentDone,
          }
        : {}),
    })
  }

  private async handleDelete(userId: string, uuid?: string, confirm?: boolean): Promise<string> {
    if (!uuid) {
      return JSON.stringify({ error: 'Missing required field: "uuid" is required for delete action.' })
    }

    // Fetch first so we can show the user exactly what will be deleted (throws if not found / not theirs).
    const target = await this.service.getExpense(userId, uuid)

    // Unless the user has already confirmed, do NOT delete — ask for confirmation first.
    if (!confirm) {
      return JSON.stringify({
        status: 'needs_confirmation',
        reason: 'delete',
        action: 'delete',
        target: { uuid, subject: target.subject, amount: target.amount, date: target.date },
        message:
          'ยืนยันการลบ: แจ้งผู้ใช้ว่ากำลังจะลบรายการค่าใช้จ่ายนี้ (ระบุชื่อ/จำนวนเงิน/วันที่จาก target) แล้วถามว่าต้องการลบจริงไหม ถ้าผู้ใช้ยืนยันให้เรียก action "delete" ซ้ำด้วย uuid เดิมพร้อม confirm=true',
      })
    }

    await this.service.delete(userId, uuid)
    return JSON.stringify({
      status: 'success',
      message: `ลบรายการค่าใช้จ่าย "${target.subject}" เรียบร้อยแล้วจ้า!`,
    })
  }
}
