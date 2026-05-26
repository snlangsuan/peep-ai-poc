import { ExpenseService } from '#/features/expenses/v1/expense.service'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class ExpenseManagementTool implements IChatTool {
  readonly name = 'manage_expenses'
  readonly description = 'จัดการบันทึกค่าใช้จ่าย (Expenses) ของผู้ใช้ ทั้งการสร้าง/บันทึกรายได้-รายจ่าย, เรียกดู, แก้ไขข้อมูล, ลบ และแสดงรายงานตามช่วงเวลา (เช่น ค่าใช้จ่ายของวันนี้, เมื่อวาน หรือระบุวันที่)'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        description: 'การดำเนินการที่ต้องการทำ: "create" (บันทึกรายการใหม่), "get" (เรียกดูรายตัว), "list" (แสดงรายงาน/รายการทั้งหมดตามช่วงเวลา), "update" (แก้ไข), "delete" (ลบ)',
      },
      uuid: {
        type: 'STRING',
        description: 'ไอดีเฉพาะของรายการค่าใช้จ่าย (จำเป็นต้องส่งเมื่อ action เป็น "get", "update", "delete")',
      },
      expenses: {
        type: 'ARRAY',
        description: 'รายการค่าใช้จ่ายที่ต้องการสร้าง (ใช้คู่กับ action "create" เท่านั้น) รองรับการส่งหลายรายการพร้อมกัน',
        items: {
          type: 'OBJECT',
          properties: {
            subject: { type: 'STRING', description: 'หัวข้อหรือชื่อรายการค่าใช้จ่าย (เช่น ค่าข้าวมันไก่, ค่าเดินทาง)' },
            amount: { type: 'NUMBER', description: 'จำนวนเงิน (เช่น 50, 120.50)' },
            category: { type: 'STRING', description: 'หมวดหมู่ค่าใช้จ่าย (เช่น Food, Travel, Shopping, Bills, Other)' },
            currency: { type: 'STRING', description: 'สกุลเงิน (ค่าเริ่มต้นเป็น "THB")' },
            location: { type: 'STRING', description: 'สถานที่ที่จ่ายเงิน' },
            date: { type: 'STRING', description: 'วันที่บันทึก รูปแบบ YYYY-MM-DD (เช่น 2026-05-24)' },
            time: { type: 'STRING', description: 'เวลาที่บันทึก รูปแบบ HH:mm (เช่น 18:30)' },
          },
          required: ['subject', 'amount', 'category', 'date'],
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
      category: {
        type: 'STRING',
        description: 'แก้ไขหมวดหมู่ค่าใช้จ่าย (ใช้กับ action "update")',
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
    },
    required: ['action'],
  }

  private service: ExpenseService

  constructor() {
    this.service = new ExpenseService(new ExpenseRepository())
  }

  async execute(
    args: {
      action: 'create' | 'get' | 'list' | 'update' | 'delete'
      uuid?: string
      expenses?: Array<{
        subject: string
        amount: number
        category: string
        currency?: string
        location?: string
        date: string
        time?: string
      }>
      subject?: string
      amount?: number
      category?: string
      currency?: string
      location?: string
      date?: string
      time?: string
      filter?: { startDate?: string; endDate?: string; page?: number; limit?: number }
    },
    context: IChatContext,
  ): Promise<string> {
    const { action } = args
    const userId = context.userId

    try {
      switch (action) {
        case 'create':
          return await this.handleCreate(userId, args.expenses)
        case 'get':
          return await this.handleGet(userId, args.uuid)
        case 'list':
          return await this.handleList(userId, args.filter)
        case 'update':
          return await this.handleUpdate(userId, args)
        case 'delete':
          return await this.handleDelete(userId, args.uuid)
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
      const validCategories = ['transport', 'food&drink', 'shopping', 'bills', 'work', 'other']
      let cat = e.category.toLowerCase().trim()
      if (cat === 'food' || cat === 'drink' || cat === 'food & drink') cat = 'food&drink'
      if (cat === 'travel' || cat === 'car' || cat === 'bts' || cat === 'mrt') cat = 'transport'
      if (!validCategories.includes(cat)) cat = 'other'
      
      return {
        subject: e.subject,
        amount: e.amount,
        category: cat as 'transport' | 'food&drink' | 'shopping' | 'bills' | 'work' | 'other',
        currency: e.currency ?? 'THB',
        location: e.location ?? null,
        date: e.date,
        time: e.time ?? null,
      }
    })
    const result = await this.service.create(userId, { expenses: mappedExpenses })
    return JSON.stringify({ message: 'บันทึกค่าใช้จ่ายเสร็จเรียบร้อยแล้วจ้า!', items: result })
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
  ): Promise<string> {
    const apiFilter = {
      start_date: filter?.startDate,
      end_date: filter?.endDate,
      page: filter?.page,
      limit: filter?.limit,
    }
    const result = await this.service.getExpenses(userId, apiFilter)
    
    // Calculate total expense amount for the queried period
    const sumAmount = result.items.reduce((acc, curr) => acc + (curr.amount || 0), 0)

    return JSON.stringify({
      total: result.metadata.total,
      count: result.metadata.count,
      page: result.metadata.page,
      limit: result.metadata.limit,
      items: result.items,
      total_amount: sumAmount,
      period: {
        start: filter?.startDate || 'all',
        end: filter?.endDate || 'all'
      }
    })
  }

  private async handleUpdate(
    userId: string,
    args: {
      uuid?: string
      subject?: string
      amount?: number
      category?: string
      currency?: string
      location?: string
      date?: string
      time?: string
    },
  ): Promise<string> {
    const { uuid, subject, amount, category, currency, location, date, time } = args
    if (!uuid) {
      return JSON.stringify({ error: 'Missing required field: "uuid" is required for update action.' })
    }
    const result = await this.service.update(userId, uuid, {
      subject,
      amount,
      category: category as any,
      currency,
      location,
      date,
      time,
    })
    return JSON.stringify({ message: 'แก้ไขรายการค่าใช้จ่ายสำเร็จแล้วจ้า!', item: result })
  }

  private async handleDelete(userId: string, uuid?: string): Promise<string> {
    if (!uuid) {
      return JSON.stringify({ error: 'Missing required field: "uuid" is required for delete action.' })
    }
    await this.service.delete(userId, uuid)
    return JSON.stringify({ message: `ลบรายการค่าใช้จ่ายเรียบร้อยแล้วจ้า!` })
  }
}
