import { getLocalTime } from '#/common/utils/datetime.util'

import type { Dayjs } from 'dayjs'

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export const SUMMARY_NAMED_PERIODS = ['today', 'yesterday', '7d', '30d', 'this_week', 'this_month'] as const
export type TSummaryNamedPeriod = (typeof SUMMARY_NAMED_PERIODS)[number]

/** Maximum span a summary may cover. Custom ranges beyond this are clamped/rejected. */
export const SUMMARY_MAX_RANGE_DAYS = 366

/** True when the inclusive range [start, end] exceeds the max allowed span. */
export function isRangeTooLong(startDate: string, endDate: string): boolean {
  const start = getLocalTime(startDate).startOf('day')
  const end = getLocalTime(endDate).startOf('day')
  return end.diff(start, 'day') + 1 > SUMMARY_MAX_RANGE_DAYS
}

export interface IPeriodInput {
  period?: TSummaryNamedPeriod
  start_date?: string
  end_date?: string
}

/** Language-agnostic period keyword the client can localize on its own. */
export type TSummaryPeriodKey = TSummaryNamedPeriod | 'custom'

export interface IResolvedPeriod {
  /** Keyword identifying the period (no localized text) — client maps to a label. */
  key: TSummaryPeriodKey
  /** Inclusive local date bounds, YYYY-MM-DD (Asia/Bangkok). */
  startDate: string
  endDate: string
  /** True only when the range covers exactly one full calendar month. */
  isFullMonth: boolean
  year: number
  month: number
  /** Thai label for internal/chat use only — NOT exposed in the API response. */
  label: string
}

function buildResolved(key: TSummaryPeriodKey, start: Dayjs, end: Dayjs, label: string): IResolvedPeriod {
  const isFullMonth =
    start.isSame(end, 'month') &&
    start.isSame(start.startOf('month'), 'day') &&
    end.isSame(start.endOf('month'), 'day')
  return {
    key,
    startDate: start.format('YYYY-MM-DD'),
    endDate: end.format('YYYY-MM-DD'),
    isFullMonth,
    year: start.year(),
    month: start.month() + 1,
    label,
  }
}

function monthLabel(d: Dayjs): string {
  return `ประจำเดือน${THAI_MONTHS[d.month()]} ${d.year()}`
}

/**
 * Resolves a named period or explicit start/end range into concrete local date
 * bounds. Explicit `start_date`/`end_date` win over `period`. Defaults to the
 * current month when nothing is provided.
 */
export function resolvePeriod(input: IPeriodInput): IResolvedPeriod {
  const now = getLocalTime()

  if (input.start_date && input.end_date) {
    let start = getLocalTime(input.start_date).startOf('day')
    let end = getLocalTime(input.end_date).startOf('day')
    if (end.isBefore(start)) {
      ;[start, end] = [end, start]
    }
    // Defensive clamp: never aggregate more than the max span (keeps the tool path
    // safe even when the HTTP-layer validation is bypassed).
    const earliest = end.subtract(SUMMARY_MAX_RANGE_DAYS - 1, 'day')
    if (start.isBefore(earliest)) {
      start = earliest
    }
    const label = start.isSame(end, 'day')
      ? start.format('D MMM YYYY')
      : `${start.format('D MMM')} - ${end.format('D MMM YYYY')}`
    return buildResolved('custom', start, end, label)
  }

  switch (input.period ?? 'this_month') {
    case 'today':
      return buildResolved('today', now.startOf('day'), now.endOf('day'), 'วันนี้')
    case 'yesterday': {
      const d = now.subtract(1, 'day')
      return buildResolved('yesterday', d.startOf('day'), d.endOf('day'), 'เมื่อวาน')
    }
    case '7d':
      return buildResolved('7d', now.subtract(6, 'day').startOf('day'), now.endOf('day'), '7 วันล่าสุด')
    case '30d':
      return buildResolved('30d', now.subtract(29, 'day').startOf('day'), now.endOf('day'), '30 วันล่าสุด')
    case 'this_week':
      return buildResolved('this_week', now.startOf('week'), now.endOf('week'), 'สัปดาห์นี้')
    case 'this_month':
    default:
      return buildResolved('this_month', now.startOf('month'), now.endOf('month'), monthLabel(now))
  }
}
