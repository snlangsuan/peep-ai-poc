import { ScheduleService } from '#/features/schedules/v1/schedule.service'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class ScheduleManagementTool implements IChatTool {
  readonly name = 'manage_schedules'
  readonly description = 'จัดการกำหนดการแจ้งเตือน (Schedule) ของผู้ใช้ ทั้งการสร้าง, เรียกดู, แก้ไข, ลบ หรือแสดงรายการทั้งหมด สามารถใช้คำสั่งค้นหาตามเวลาได้'
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      action: {
        type: 'STRING',
        description: 'การดำเนินการที่ต้องการทำ: "create" (สร้างใหม่), "get" (เรียกดูรายตัว), "list" (แสดงรายการทั้งหมด), "update" (แก้ไข), "delete" (ลบ)',
      },
      uuid: {
        type: 'STRING',
        description: 'ไอดีเฉพาะของกำหนดการ (จำเป็นต้องส่งเมื่อ action เป็น "get", "update", "delete")',
      },
      scheduledAt: {
        type: 'STRING',
        description: 'วันและเวลาที่ต้องการแจ้งเตือน รูปแบบ ISO 8601 (เช่น 2026-05-24T19:35:00+07:00) (จำเป็นสำหรับ action "create" หรือใช้แก้ไขใน "update")',
      },
      title: {
        type: 'STRING',
        description: 'หัวข้อหรือข้อความแจ้งเตือนเมื่อถึงเวลา (จำเป็นสำหรับ action "create" หรือใช้แก้ไขใน "update")',
      },
      description: {
        type: 'STRING',
        description: 'รายละเอียดเพิ่มเติมของกำหนดการ',
      },
      location: {
        type: 'STRING',
        description: 'สถานที่ที่เกี่ยวข้องกับกำหนดการ',
      },
      filter: {
        type: 'OBJECT',
        properties: {
          page: { type: 'NUMBER', description: 'หน้าปัจจุบันเริ่มต้นที่ 1' },
          limit: { type: 'NUMBER', description: 'จำนวนรายการต่อหน้า (เริ่มต้น 25)' },
        },
      },
    },
    required: ['action'],
  }

  private service: ScheduleService

  constructor() {
    this.service = new ScheduleService(new ScheduleRepository())
  }

  async execute(
    args: {
      action: 'create' | 'get' | 'list' | 'update' | 'delete'
      uuid?: string
      scheduledAt?: string
      title?: string
      description?: string
      location?: string
      filter?: { page?: number; limit?: number }
    },
    context: IChatContext,
  ): Promise<string> {
    const { action, uuid, scheduledAt, title, description, location, filter } = args
    const userId = context.userId

    try {
      switch (action) {
        case 'create': {
          if (!scheduledAt || !title) {
            return JSON.stringify({ error: 'Missing required fields for create: "scheduledAt" and "title" are required.' })
          }
          const result = await this.service.create(userId, {
            scheduled_at: scheduledAt,
            title,
            description,
            location,
          })
          return JSON.stringify({ message: 'สร้างกำหนดการสำเร็จแล้วจ้า!', schedule: result })
        }

        case 'get': {
          if (!uuid) {
            return JSON.stringify({ error: 'Missing required field: "uuid" is required for get action.' })
          }
          const result = await this.service.getSchedule(userId, uuid)
          return JSON.stringify({ schedule: result })
        }

        case 'list': {
          const result = await this.service.getSchedules(userId, filter)
          return JSON.stringify({
            total: result.metadata.total,
            count: result.metadata.count,
            page: result.metadata.page,
            limit: result.metadata.limit,
            items: result.items,
          })
        }

        case 'update': {
          if (!uuid) {
            return JSON.stringify({ error: 'Missing required field: "uuid" is required for update action.' })
          }
          const result = await this.service.update(userId, uuid, {
            scheduled_at: scheduledAt,
            title,
            description,
            location,
          })
          return JSON.stringify({ message: 'แก้ไขกำหนดการสำเร็จแล้วจ้า!', schedule: result })
        }

        case 'delete': {
          if (!uuid) {
            return JSON.stringify({ error: 'Missing required field: "uuid" is required for delete action.' })
          }
          await this.service.delete(userId, uuid)
          return JSON.stringify({ message: `ลบกำหนดการไอดี ${uuid} สำเร็จแล้วจ้า!` })
        }

        default:
          return JSON.stringify({ error: `Unsupported action: "${action}"` })
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message || 'Something went wrong while managing schedules.' })
    }
  }
}
