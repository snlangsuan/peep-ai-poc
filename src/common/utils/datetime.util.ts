import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'

import type { Dayjs } from 'dayjs'

dayjs.extend(utc)
dayjs.extend(timezone)

const LOCAL_TIMEZONE = 'Asia/Bangkok'

export const getLocalTimeFromUnix = (tms: number): Dayjs => {
  return dayjs.unix(tms).tz(LOCAL_TIMEZONE)
}

export const getLocalTime = (date?: string | Date | Dayjs): Dayjs => {
  return date ? dayjs.tz(date, LOCAL_TIMEZONE) : dayjs().tz(LOCAL_TIMEZONE)
}

export const getUtcTime = (date?: string | Date | Dayjs): Dayjs => {
  return date ? dayjs.utc(date) : dayjs.utc()
}

export const convertToLocalTime = (date: string | Date | Dayjs): Dayjs => {
  return dayjs(date).tz(LOCAL_TIMEZONE)
}

export const convertToUtcTime = (date: string | Date | Dayjs): Dayjs => {
  return dayjs(date).utc()
}

export const getYearMonthFromRange = (startDate: Dayjs, endDate: Dayjs): string[] => {
  const results: string[] = []
  let currentDate = startDate.clone()
  const maxDate = endDate.clone().add(1, 'month')
  while (currentDate.isBefore(maxDate, 'month')) {
    results.push(currentDate.format('YYYY-MM'))
    currentDate = currentDate.add(1, 'month')
  }
  return [...new Set(results)]
}

export const getDaysFromRange = (startDate: Dayjs, endDate: Dayjs): Dayjs[] => {
  const results: Dayjs[] = []
  let currentDate = startDate.clone()
  const maxDate = endDate.clone().add(1, 'day')
  while (currentDate.isBefore(maxDate, 'day')) {
    results.push(currentDate.clone())
    currentDate = currentDate.add(1, 'day')
  }
  return results
}
