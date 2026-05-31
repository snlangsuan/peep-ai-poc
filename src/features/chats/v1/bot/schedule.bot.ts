import type { BotTask, BotTool } from '../brain.bot'
import type { ScheduleService } from '#/features/schedules/v1/schedule.service'
import type { IScheduleArgs, ISummaryArgs } from '../brain.type'
import type { TCreateSchedule, TScheduleListFilter } from '#/features/schedules/v1/schedule.type'
import { getLocalTime } from '~/src/common/utils/datetime.util'
import { ChatFormatter } from '../chat.formatter'

export const getScheduleTasks = (): BotTask[] => [
  {
    id: 'schedules',
    name: 'Schedules',
    description: 'Any mention of appointments, meetings, events, or plans. Always identify the date and time.',
    guidelines: [
      'For schedules, if a specific time is not mentioned, leave it empty or use common sense (e.g., "dinner" is evening).',
    ],
  },
]

export const handleGetScheduleSummary = async (
  scheduleService: ScheduleService,
  args: ISummaryArgs,
  user_id: string,
): Promise<string> => {
  const s = getLocalTime(args.start_date) || getLocalTime()
  const e = getLocalTime(args.end_date) || getLocalTime()

  if (e.diff(s, 'day') > 30) {
    return 'ขออภัยครับ เพื่อให้ข้อมูลอ่านง่ายและไม่ยาวจนเกินไป ผมแนะนำให้ระบุช่วงสรุปข้อมูลไม่เกิน 30 วันนะครับ รบกวนลองปรับช่วงวันที่อีกนิด เดี๋ยวผมรีบสรุปให้เลยครับ! 😊'
  }

  if (e.diff(s, 'day') > 365) {
    return 'ขอโทษทีครับ ระบบสามารถดึงข้อมูลย้อนหลังได้สูงสุด 1 ปีครับ รบกวนลองเลือกช่วงเวลาที่สั้นลงอีกนิดนะครับ เดี๋ยวผมจัดการให้เลยครับ! ✨'
  }

  const startDate = s.startOf('day').format('YYYY-MM-DD')
  const endDate = e.endOf('day').format('YYYY-MM-DD')

  const result = await scheduleService.list(user_id, {
    page: 1,
    limit: 100,
    start_date: startDate,
    end_date: endDate,
    sort: 'scheduled_at',
    desc: false,
  })

  const dateRangeStr = ChatFormatter.formatDateRange(startDate, endDate)
  const isSingleDay = startDate === endDate
  return ChatFormatter.formatScheduleList(result, dateRangeStr, isSingleDay)
}

export const getScheduleTools = (scheduleService: ScheduleService): BotTool[] => [
  {
    name: 'manage_schedule',
    declaration: {
      name: 'manage_schedule',
      description: 'Record or manage appointments, meetings, reminders, or any time-based events/plans.',
      parameters: {
        type: 'OBJECT',
        properties: {
          action: {
            type: 'STRING',
            enum: ['create', 'list', 'update'],
            description: 'The action to perform. Default is "create" for new mentions.',
          },
          id: {
            type: 'STRING',
            description: 'The ID of the schedule (required for update).',
          },
          title: { type: 'STRING', description: 'Clear title of the event or task.' },
          location: { type: 'STRING', description: 'Where the event will take place.' },
          date: {
            type: 'STRING',
            description:
              'The date of the event (YYYY-MM-DD). Use the User Message Sent At as reference for relative dates.',
          },
          time: { type: 'STRING', description: 'The time of the event (HH:mm). Use 24-hour format.' },
          remind_before_minutes: {
            type: 'NUMBER',
            description: 'How many minutes before the event to notify the user.',
          },
          start_date: { type: 'STRING', description: 'For listing: Start date range (YYYY-MM-DD).' },
          end_date: { type: 'STRING', description: 'For listing: End date range (YYYY-MM-DD).' },
        },
        required: ['action'],
      },
    },
    handler: async (args, userId) => {
      const scheduleArgs = args as IScheduleArgs
      switch (scheduleArgs.action) {
        case 'create':
          return scheduleService.create(userId, {
            title: scheduleArgs.title || 'New Schedule',
            date: scheduleArgs.date || getLocalTime().format('YYYY-MM-DD'),
            time: scheduleArgs.time || null,
            location: scheduleArgs.location || null,
            remind_before_minutes: scheduleArgs.remind_before_minutes ?? 15,
          } as unknown as TCreateSchedule)
        case 'update':
          const { id, action, ...data } = scheduleArgs
          const updateData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined))
          return scheduleService.update(userId, id as string, updateData as Partial<TCreateSchedule>)
        default:
          const { action: _, ...rest } = scheduleArgs
          return scheduleService.list(userId, {
            page: 1,
            limit: 10,
            desc: true,
            ...rest,
          } as unknown as TScheduleListFilter)
      }
    },
  },
  {
    name: 'get_schedule_summary',
    declaration: {
      name: 'get_schedule_summary',
      description: 'Get a summary of upcoming or past schedules.',
      parameters: {
        type: 'OBJECT',
        properties: {
          start_date: { type: 'STRING', description: 'Start date (YYYY-MM-DD).' },
          end_date: { type: 'STRING', description: 'End date (YYYY-MM-DD).' },
        },
      },
    },
    handler: async (args, userId) => {
      return handleGetScheduleSummary(scheduleService, args as unknown as ISummaryArgs, userId)
    },
  },
]
