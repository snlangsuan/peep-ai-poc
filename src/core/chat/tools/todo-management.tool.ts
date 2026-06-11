import { TodoService } from '#/features/todos/v1/todo.service'
import { TodoRepository } from '#/features/todos/v1/todo.repository'
import { pushBotTodoListMessage, pushBotTodoSavedMessage } from '#/features/chats/v1/todo-notify.helper'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class TodoManagementTool implements IChatTool {
  readonly name = 'manage_todos'
  readonly description = 'จัดการรายการสิ่งที่ต้องทำ (Todo List) ทั้งสร้างใหม่, เรียกดู, แก้ไขหัวข้อหรือทำเครื่องหมายเสร็จสิ้น, ลบ และแสดงรายการทั้งหมด (รองรับ Pagination แสดงทีละ 10 รายการ และปุ่มถัดไป/ก่อนหน้า)'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        description: 'การดำเนินการที่ต้องการทำ: "create" (สร้างใหม่), "get" (เรียกดูรายตัว), "list" (แสดงรายการทั้งหมด), "update" (แก้ไขหัวข้อหรือสถานะ), "delete" (ลบ)',
      },
      uuid: {
        type: 'STRING',
        description: 'ไอดีเฉพาะของ Todo (จำเป็นต้องส่งเมื่อ action เป็น "get", "update", "delete")',
      },
      confirm: {
        type: 'BOOLEAN',
        description:
          'ใช้กับ action "delete" เท่านั้น: ตั้งเป็น true เมื่อผู้ใช้ "ยืนยันแล้ว" ว่าจะลบรายการ. โดยปกติไม่ต้องส่ง (หรือ false) — ระบบจะคืน needs_confirmation พร้อมรายละเอียดรายการให้ถามผู้ใช้ก่อน เมื่อผู้ใช้ยืนยันค่อยเรียก delete ซ้ำพร้อม confirm=true',
      },
      title: {
        type: 'STRING',
        description: 'หัวข้อของ Todo (ใช้สร้างทีละรายการ หรือใช้แก้ไขใน "update")',
      },
      description: {
        type: 'STRING',
        description: 'รายละเอียดของ Todo',
      },
      todos: {
        type: 'ARRAY',
        description:
          'รายการ Todo หลายรายการที่ต้องการสร้างพร้อมกัน (ใช้กับ action "create") ใช้เมื่อข้อความของผู้ใช้มีหลายงาน เช่น แต่ละบรรทัด (new line) เป็นคนละงาน หรือคั่นด้วยจุลภาค — แต่ละ item แยกเป็นคนละ todo ถ้ามี todos array จะถูกใช้แทน title เดี่ยว',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'หัวข้อของ Todo' },
            description: { type: 'STRING', description: 'รายละเอียด — optional' },
          },
          required: ['title'],
        },
      },
      completed: {
        type: 'BOOLEAN',
        description: 'สถานะการเสร็จสิ้น (true = เสร็จแล้ว, false = ยังไม่เสร็จ) (ใช้กับ action "update")',
      },
      filter: {
        type: 'OBJECT',
        properties: {
          page: { type: 'NUMBER', description: 'เลขหน้าของข้อมูลที่จะดึง (เริ่มต้นหน้าแรกคือ 1)' },
          limit: { type: 'NUMBER', description: 'จำนวนรายการที่แสดงต่อครั้ง (ค่าเริ่มต้นแนะนำที่ 10 รายการเพื่อความกระชับ)' },
          completed: { type: 'BOOLEAN', description: 'กรองสถานะ: true (ดึงเฉพาะที่เสร็จแล้ว), false (ดึงเฉพาะที่ยังไม่เสร็จ)' },
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

  private service: TodoService

  constructor() {
    this.service = new TodoService(new TodoRepository())
  }

  async execute(
    args: {
      action: 'create' | 'get' | 'list' | 'update' | 'delete'
      uuid?: string
      confirm?: boolean
      title?: string
      description?: string
      completed?: boolean
      todos?: Array<{ title: string; description?: string }>
      filter?: { page?: number; limit?: number; completed?: boolean }
      lookup?: boolean
    },
    context: IChatContext,
  ): Promise<string> {
    const { action, uuid, confirm, title, description, completed, todos, filter, lookup } = args
    const userId = context.userId

    // Force default limit to 10 if not provided, as requested for pagination of 10 items
    const actualFilter = {
      page: filter?.page ?? 1,
      limit: filter?.limit ?? 10,
      completed: filter?.completed,
    }

    try {
      switch (action) {
        case 'create':
          return await this.handleCreate(userId, { title, description, todos })
        case 'get':
          return await this.handleGet(userId, uuid)
        case 'list':
          return this.handleList(userId, actualFilter, lookup)
        case 'update':
          return await this.handleUpdate(userId, { uuid, title, description, completed })
        case 'delete':
          return await this.handleDelete(userId, uuid, confirm)
        default:
          return JSON.stringify({ error: `Unsupported action: "${action}"` })
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message || 'Something went wrong while managing todos.' })
    }
  }

  private async handleCreate(
    userId: string,
    args: { title?: string; description?: string; todos?: Array<{ title: string; description?: string }> },
  ): Promise<string> {
    // Accept either a single title or a batch `todos` array (e.g. one item per line).
    const rawItems =
      args.todos && args.todos.length > 0 ? args.todos : args.title ? [{ title: args.title, description: args.description }] : []

    const items = rawItems
      .filter((it) => typeof it.title === 'string' && it.title.trim().length > 0)
      .map((it) => ({ title: it.title.trim(), description: it.description }))

    if (items.length === 0) {
      return JSON.stringify({ error: 'Missing required field: "title" (or a non-empty "todos" array) is required for create action.' })
    }

    const created = await this.service.createMany(userId, items)

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    const saved = await pushBotTodoSavedMessage(userId, created, { emitSSE: false })
    if (saved) {
      savedForAgentDone = {
        id: saved.id,
        content: saved.content,
        createdAt: saved.createdAt.toISOString(),
      }
    }

    return JSON.stringify({
      message:
        created.length === 1
          ? 'สร้างรายการใหม่สำเร็จแล้วจ้า!'
          : `สร้างรายการสิ่งที่ต้องทำสำเร็จ ${created.length} รายการแล้วจ้า!`,
      todos: created,
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
    const result = await this.service.getTodo(userId, uuid)
    return JSON.stringify({ todo: result })
  }

  private async handleUpdate(
    userId: string,
    args: { uuid?: string; title?: string; description?: string; completed?: boolean },
  ): Promise<string> {
    if (!args.uuid) {
      return JSON.stringify({ error: 'Missing required field: "uuid" is required for update action.' })
    }
    const result = await this.service.update(userId, args.uuid, {
      title: args.title,
      description: args.description,
      completed: args.completed,
    })

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    const saved = await pushBotTodoSavedMessage(userId, [result], { emitSSE: false })
    if (saved) {
      savedForAgentDone = {
        id: saved.id,
        content: saved.content,
        createdAt: saved.createdAt.toISOString(),
      }
    }

    return JSON.stringify({
      message: 'อัปเดตรายการสำเร็จแล้วจ้า!',
      todo: result,
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
    const target = await this.service.getTodo(userId, uuid)

    // Unless the user has already confirmed, do NOT delete — ask for confirmation first.
    if (!confirm) {
      return JSON.stringify({
        status: 'needs_confirmation',
        reason: 'delete',
        action: 'delete',
        target: { uuid, title: target.title, completed: target.completed },
        message:
          'ยืนยันการลบ: แจ้งผู้ใช้ว่ากำลังจะลบรายการสิ่งที่ต้องทำนี้ (ระบุชื่อจาก target) แล้วถามว่าต้องการลบจริงไหม ถ้าผู้ใช้ยืนยันให้เรียก action "delete" ซ้ำด้วย uuid เดิมพร้อม confirm=true',
      })
    }

    await this.service.delete(userId, uuid)
    return JSON.stringify({
      status: 'success',
      message: `ลบรายการ "${target.title}" สำเร็จแล้วจ้า!`,
    })
  }

  private async handleList(
    userId: string,
    actualFilter: { page: number; limit: number; completed?: boolean },
    lookup?: boolean,
  ): Promise<string> {
    const result = await this.service.getTodos(userId, actualFilter)

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    // In lookup mode the agent is only resolving a uuid (e.g. before delete), so don't
    // push a list card or suppress the agent's response.
    if (!lookup && result.items.length > 0) {
      const saved = await pushBotTodoListMessage(userId, result.items, { emitSSE: false })
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
      has_more: result.metadata.total > actualFilter.page * actualFilter.limit,
      ...(savedForAgentDone
        ? {
            __suppress_agent_response: true,
            __agent_saved_message: savedForAgentDone,
          }
        : {}),
    })
  }
}
