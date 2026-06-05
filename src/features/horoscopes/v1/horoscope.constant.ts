export interface IZodiacSign {
  key: string
  name: string
  dateRange: string
}

/**
 * The 12 zodiac signs with FIXED Thai names and date ranges (Western tropical).
 * Single source of truth shared by the generator cron and the read API.
 */
export const ZODIAC_SIGNS: ReadonlyArray<IZodiacSign> = [
  { key: 'aries', name: 'ราศีเมษ', dateRange: '22 มี.ค. - 21 เม.ย.' },
  { key: 'taurus', name: 'ราศีพฤษภ', dateRange: '22 เม.ย. - 21 พ.ค.' },
  { key: 'gemini', name: 'ราศีเมถุน', dateRange: '22 พ.ค. - 21 มิ.ย.' },
  { key: 'cancer', name: 'ราศีกรกฎ', dateRange: '22 มิ.ย. - 21 ก.ค.' },
  { key: 'leo', name: 'ราศีสิงห์', dateRange: '22 ก.ค. - 21 ส.ค.' },
  { key: 'virgo', name: 'ราศีกันย์', dateRange: '22 ส.ค. - 21 ก.ย.' },
  { key: 'libra', name: 'ราศีตุลย์', dateRange: '22 ก.ย. - 21 ต.ค.' },
  { key: 'scorpio', name: 'ราศีพิจิก', dateRange: '22 ต.ค. - 21 พ.ย.' },
  { key: 'sagittarius', name: 'ราศีธนู', dateRange: '22 พ.ย. - 21 ธ.ค.' },
  { key: 'capricorn', name: 'ราศีมังกร', dateRange: '22 ธ.ค. - 21 ม.ค.' },
  { key: 'aquarius', name: 'ราศีกุมภ์', dateRange: '22 ม.ค. - 18 ก.พ.' },
  { key: 'pisces', name: 'ราศีมีน', dateRange: '19 ก.พ. - 21 มี.ค.' },
]

const THAI_MONTH_ABBR: Record<string, number> = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
  'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
}

/** Parses the start of a Thai dateRange ("22 มี.ค. - 21 เม.ย.") into month*100+day. */
function parseStartMonthDay(dateRange: string): number {
  const start = (dateRange.split('-')[0] ?? '').trim()
  const m = start.match(/^(\d{1,2})\s+(.+)$/)
  if (!m) return 0
  const day = parseInt(m[1]!, 10)
  const month = THAI_MONTH_ABBR[m[2]!.trim()] ?? 0
  return month * 100 + day
}

/**
 * Returns the zodiac sign key for a given month/day, derived from the date ranges
 * in ZODIAC_SIGNS (single source of truth — auto-follows any range edits).
 */
export function getSignKeyByDate(month: number, day: number): string {
  const md = month * 100 + day
  const starts = ZODIAC_SIGNS.map((s) => ({ key: s.key, start: parseStartMonthDay(s.dateRange) })).sort(
    (a, b) => a.start - b.start,
  )
  // The last sign (largest start, e.g. Capricorn on Dec 22) wraps past year-end,
  // so it's the default for dates before the smallest start.
  let chosen = starts[starts.length - 1]!.key
  for (const s of starts) {
    if (md >= s.start) chosen = s.key
  }
  return chosen
}

/** Resolves a YYYY-MM-DD birthdate to its zodiac sign key, or undefined if invalid. */
export function getSignKeyByBirthdate(birthdate: string): string | undefined {
  const m = birthdate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return undefined
  const month = parseInt(m[2]!, 10)
  const day = parseInt(m[3]!, 10)
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined
  return getSignKeyByDate(month, day)
}
