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
      title: {
        type: 'STRING',
        description: 'หัวข้อของ Todo (จำเป็นสำหรับ action "create" หรือใช้แก้ไขใน "update")',
      },
      description: {
        type: 'STRING',
        description: 'รายละเอียดของ Todo',
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
      title?: string
      description?: string
      completed?: boolean
      filter?: { page?: number; limit?: number; completed?: boolean }
    },
    context: IChatContext,
  ): Promise<string> {
    const { action, uuid, title, description, completed, filter } = args
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
          return await this.handleCreate(userId, { title, description })
        case 'get':
          return await this.handleGet(userId, uuid)
        case 'list':
          return this.handleList(userId, actualFilter)
        case 'update':
          return await this.handleUpdate(userId, { uuid, title, description, completed })
        case 'delete':
          return await this.handleDelete(userId, uuid)
        default:
          return JSON.stringify({ error: `Unsupported action: "${action}"` })
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message || 'Something went wrong while managing todos.' })
    }
  }

  private async handleCreate(
    userId: string,
    args: { title?: string; description?: string },
  ): Promise<string> {
    if (!args.title) {
      return JSON.stringify({ error: 'Missing required field: "title" is required for create action.' })
    }
    const result = await this.service.create(userId, {
      title: args.title,
      description: args.description,
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
      message: 'สร้างรายการใหม่สำเร็จแล้วจ้า!',
      todo: result,
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

  private async handleDelete(userId: string, uuid?: string): Promise<string> {
    if (!uuid) {
      return JSON.stringify({ error: 'Missing required field: "uuid" is required for delete action.' })
    }
    await this.service.delete(userId, uuid)
    return JSON.stringify({ message: `ลบรายการสิ่งที่ต้องทำสำเร็จแล้วจ้า!` })
  }

  private async handleList(
    userId: string,
    actualFilter: { page: number; limit: number; completed?: boolean },
  ): Promise<string> {
    const result = await this.service.getTodos(userId, actualFilter)

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    if (result.items.length > 0) {
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
