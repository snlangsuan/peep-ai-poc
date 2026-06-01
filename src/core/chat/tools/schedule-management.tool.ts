import { ScheduleService } from '#/features/schedules/v1/schedule.service'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import { convertToLocalTime } from '#/common/utils/datetime.util'
import {
  pushBotScheduleCreatedMessage,
  pushBotScheduleListMessage,
} from '#/features/chats/v1/schedule-notify.helper'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'
import type { TScheduleResponse } from '#/features/schedules/v1/schedule.type'

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
        description: 'วันและเวลาเริ่มต้นของกำหนดการ (start time, ใช้เป็นเวลาแจ้งเตือนด้วย) รูปแบบ ISO 8601 (เช่น 2026-05-24T19:35:00+07:00) (ใช้คู่กับ "create" หรือ "update" สำหรับรายการเดียว)',
      },
      endAt: {
        type: 'STRING',
        description: 'วันและเวลาที่กำหนดการสิ้นสุด (end time) รูปแบบ ISO 8601 (เช่น 2026-05-24T21:00:00+07:00) — optional ถ้าไม่ระบุจะถือว่าเป็น event เดียวที่ไม่มีช่วงเวลา',
      },
      title: {
        type: 'STRING',
        description: 'หัวข้อ/กิจกรรม รวมสถานที่ในประโยคเดียวกัน เช่น "ประชุมที่ห้องประชุม 3" (ห้ามแยก location ออก — เก็บเป็นข้อความเดียว) (ใช้คู่กับ "create" หรือ "update" สำหรับรายการเดียว)',
      },
      invitees: {
        type: 'STRING',
        description: 'รายชื่อผู้ที่จะเชิญ รับเป็น text (เช่น "คุณเอ คุณบี" หรือ "alice@example.com, bob@example.com") — optional',
      },
      repeat: {
        type: 'STRING',
        description: 'รูปแบบการเกิดซ้ำของกำหนดการ ค่าที่ใช้ได้: "none" (ไม่ซ้ำ), "daily" (ทุกวัน), "weekly" (ทุกสัปดาห์), "monthly" (ทุกเดือน), "yearly" (ทุกปี) — optional',
      },
      note: {
        type: 'STRING',
        description: 'หมายเหตุเพิ่มเติม (note) ที่ไม่ใช่ description — optional',
      },
      schedules: {
        type: 'ARRAY',
        description:
          'รายการกำหนดการที่ต้องการสร้างพร้อมกัน (ใช้คู่กับ action "create" เท่านั้น) ใช้เมื่อ user พูดถึงหลายรายการในข้อความเดียว (เช่น "วันนี้ฉันมีประชุมตอน 10 โมง มีออกกำลังกายตอน 6 โมงเย็น" → ส่ง 2 items) — ถ้ามี schedules array จะถูกใช้แทน scheduledAt/title/... ที่ top-level',
        items: {
          type: 'OBJECT',
          properties: {
            scheduledAt: { type: 'STRING', description: 'วันและเวลาเริ่มต้น รูปแบบ ISO 8601' },
            endAt: { type: 'STRING', description: 'วันและเวลาสิ้นสุด รูปแบบ ISO 8601 — optional' },
            title: { type: 'STRING', description: 'หัวข้อ/กิจกรรม' },
            invitees: { type: 'STRING', description: 'รายชื่อผู้ที่จะเชิญ (text) — optional' },
            repeat: { type: 'STRING', description: 'none / daily / weekly / monthly / yearly — optional' },
            note: { type: 'STRING', description: 'หมายเหตุ — optional' },
          },
          required: ['scheduledAt', 'title'],
        },
      },
      filter: {
        type: 'OBJECT',
        properties: {
          startDate: {
            type: 'STRING',
            description: 'กรองตั้งแต่วันที่ระบุ รูปแบบ YYYY-MM-DD (เช่น 2026-05-31) — ใช้คู่กับ action "list"',
          },
          endDate: {
            type: 'STRING',
            description: 'กรองถึงวันที่ระบุ รูปแบบ YYYY-MM-DD (เช่น 2026-05-31) — ใช้คู่กับ action "list"',
          },
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
      endAt?: string
      title?: string
      invitees?: string
      repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
      note?: string
      schedules?: Array<{
        scheduledAt: string
        endAt?: string
        title: string
        invitees?: string
        repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
        note?: string
      }>
      filter?: { startDate?: string; endDate?: string; page?: number; limit?: number }
    },
    context: IChatContext,
  ): Promise<string> {
    const { action, uuid, scheduledAt, endAt, title, invitees, repeat, note, schedules, filter } = args
    const userId = context.userId

    try {
      switch (action) {
        case 'create':
          return this.handleCreate(userId, { scheduledAt, endAt, title, invitees, repeat, note, schedules })

        case 'get': {
          if (!uuid) {
            return JSON.stringify({ error: 'Missing required field: "uuid" is required for get action.' })
          }
          const result = await this.service.getSchedule(userId, uuid)
          return JSON.stringify({ schedule: this.formatScheduleForLLM(result) })
        }

        case 'list':
          return this.handleList(userId, filter)

        case 'update': {
          if (!uuid) {
            return JSON.stringify({ error: 'Missing required field: "uuid" is required for update action.' })
          }
          const result = await this.service.update(userId, uuid, {
            scheduled_at: scheduledAt,
            end_at: endAt,
            title,
            invitees,
            repeat,
            note,
          })
          let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
          const saved = await pushBotScheduleCreatedMessage(userId, [result], { emitSSE: false })
          if (saved) {
            savedForAgentDone = {
              id: saved.id,
              content: saved.content,
              createdAt: saved.createdAt.toISOString(),
            }
          }
          return JSON.stringify({
            message: 'แก้ไขกำหนดการสำเร็จแล้วจ้า!',
            schedule: this.formatScheduleForLLM(result),
            ...(savedForAgentDone
              ? {
                  __suppress_agent_response: true,
                  __agent_saved_message: savedForAgentDone,
                }
              : {}),
          })
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

  private async handleCreate(
    userId: string,
    args: {
      scheduledAt?: string
      endAt?: string
      title?: string
      invitees?: string
      repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
      note?: string
      schedules?: Array<{
        scheduledAt: string
        endAt?: string
        title: string
        invitees?: string
        repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
        note?: string
      }>
    },
  ): Promise<string> {
    const { scheduledAt, endAt, title, invitees, repeat, note, schedules } = args
    let items = schedules
    if (!items || items.length === 0) {
      if (!scheduledAt || !title) {
        return JSON.stringify({
          error:
            'Missing required fields for create: provide either ("scheduledAt" + "title") or a non-empty "schedules" array.',
        })
      }
      items = [{ scheduledAt, endAt, title, invitees, repeat, note }]
    }

    const created: TScheduleResponse[] = []
    const failed: Array<{ index: number; error: string }> = []
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!
      if (!it.scheduledAt || !it.title) {
        failed.push({ index: i, error: 'Each schedule item requires "scheduledAt" and "title".' })
        continue
      }
      try {
        const r = await this.service.create(userId, {
          scheduled_at: it.scheduledAt,
          end_at: it.endAt,
          title: it.title,
          invitees: it.invitees,
          repeat: it.repeat,
          note: it.note,
          type: 'calendar',
        })
        created.push(r)
      } catch (err: any) {
        failed.push({ index: i, error: err?.message || 'unknown error' })
      }
    }
    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    if (created.length > 0) {
      const saved = await pushBotScheduleCreatedMessage(userId, created, { emitSSE: false })
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
        created.length === 1
          ? 'สร้างกำหนดการสำเร็จแล้วจ้า!'
          : `สร้างกำหนดการสำเร็จ ${created.length} รายการแล้วจ้า!`,
      schedules: created.map((s) => this.formatScheduleForLLM(s)),
      ...(failed.length > 0 ? { failed } : {}),
      // When the helper has pre-saved the bot message, tell the agent to skip its own
      // saveBotMessage and use this saved message in its `done` event instead.
      ...(savedForAgentDone
        ? {
            __suppress_agent_response: true,
            __agent_saved_message: savedForAgentDone,
          }
        : {}),
    })
  }

  private async handleList(
    userId: string,
    filter?: { startDate?: string; endDate?: string; page?: number; limit?: number },
  ): Promise<string> {
    const result = await this.service.getSchedules(userId, {
      start_date: filter?.startDate,
      end_date: filter?.endDate,
      page: filter?.page,
      limit: filter?.limit,
    })

    const shouldPushCard =
      result.items.length > 0 &&
      !!filter?.startDate &&
      !!filter?.endDate &&
      this.daysBetweenInclusive(filter.startDate, filter.endDate) <= 31

    let savedForAgentDone: { id: string; content: unknown[]; createdAt: string } | undefined
    if (shouldPushCard) {
      const saved = await pushBotScheduleListMessage(userId, result.items, { emitSSE: false })
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
      items: result.items.map((s) => this.formatScheduleForLLM(s)),
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

  private formatScheduleForLLM(s: TScheduleResponse): TScheduleResponse & {
    scheduled_at_local: string
    end_at_local: string | null
  } {
    return {
      ...s,
      scheduled_at: convertToLocalTime(s.scheduled_at).format(),
      end_at: s.end_at ? convertToLocalTime(s.end_at).format() : null,
      scheduled_at_local: convertToLocalTime(s.scheduled_at).format('YYYY-MM-DD HH:mm'),
      end_at_local: s.end_at ? convertToLocalTime(s.end_at).format('YYYY-MM-DD HH:mm') : null,
    }
  }
}
