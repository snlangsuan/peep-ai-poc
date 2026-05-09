import type { TExpenseListResponse } from '#/features/expenses/v1/expense.type'
import type { TScheduleListResponse } from '#/features/schedules/v1/schedule.type'
import { getLocalTime } from '~/src/common/utils/datetime.util'

export class ChatFormatter {
  static formatDateRange(start: string, end: string): string {
    if (start === end) return 'ในวันนี้'

    const s = getLocalTime(start)
    const e = getLocalTime(end)

    const thMonth = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

    const sDay = s.format('DD')
    const sMonth = thMonth[s.month()]
    const sYear = s.year()

    const eDay = e.format('DD')
    const eMonth = thMonth[e.month()]
    const eYear = e.year()

    if (s.year() === e.year() && s.month() === e.month()) {
      return ` (${sDay} - ${eDay} ${sMonth} ${sYear})`
    }

    return ` (${sDay} ${sMonth} ${sYear} - ${eDay} ${eMonth} ${eYear})`
  }
  static formatExpenseList(result: TExpenseListResponse, dateRangeStr: string): string {
    let message = `💰 รายการค่าใช้จ่าย${dateRangeStr}\n\n`
    if (result.items.length === 0) {
      message += 'ไม่มีรายการค่าใช้จ่ายในช่วงเวลานี้'
    } else {
      let total = 0
      result.items.forEach((item) => {
        message += `• ${item.subject}: ${item.amount} ${item.currency}\n`
        total += item.amount
      })
      message += `\nยอดรวมทั้งหมด: ${total} THB`
      message += '\n\nมีรายการไหนที่อยากให้ผมช่วยจดเพิ่ม หรืออยากแก้ไขตรงไหนมั้ยครับ'
    }
    return message
  }

  static formatScheduleList(result: TScheduleListResponse, dateRangeStr: string, isSingleDay: boolean): string {
    let message = `📅 รายการนัดหมาย${dateRangeStr}\n\n`
    if (result.items.length === 0) {
      message += 'ไม่มีรายการนัดหมายในช่วงเวลานี้'
    } else {
      result.items.forEach((item) => {
        const timeStr = item.time ? `${item.time} ` : ''
        const locationStr = item.location ? ` (${item.location})` : ''
        const dateStr = isSingleDay ? '' : `${item.date} `

        message += `• ${dateStr}${timeStr} - ${item.title}${locationStr}\n`
      })
      message += '\nอยากจะเพิ่มเติมหรืออยากแก้ไขตรงไหนมั้ยครับ'
    }
    return message
  }
}
