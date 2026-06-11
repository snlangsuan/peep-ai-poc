import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { AIService } from '#/common/services/ai.service'
import { getLocalTime, getUtcTime } from '#/common/utils/datetime.util'
import { ZODIAC_SIGNS } from '#/features/horoscopes/v1/horoscope.constant'
import { envVariables } from '#/factory'

import type { IScheduleModule } from '#/worker/schedule/schedule.type'

/** Firestore collection holding one generated horoscope per zodiac sign per day. */
const HOROSCOPE_COLLECTION = 'daily_horoscopes'

/** Allowed tagline length (characters) and how many times to retry to hit it. */
const TAGLINE_MIN_CHARS = 50
const TAGLINE_MAX_CHARS = 80
const TAGLINE_MAX_ATTEMPTS = 3

const GENERATION_INSTRUCTION = `คุณคือนักพยากรณ์ดวงชะตารายวันภาษาไทย เขียนคำทำนายเชิงบวก ให้กำลังใจ อ่านลื่น กระชับ สำหรับราศีและวันที่ที่กำหนด

ตอบกลับเป็น STRICT JSON เท่านั้น ห้ามมีข้อความอื่น ห้ามมี code fence:
{
  "tagline": "คำโปรยสั้น กระชับ ดึงดูดความสนใจ (50-80 ตัวอักษร ไม่ต้องเขียนยาวจนเต็ม)",
  "lucky_numbers": ["12", "7", "29"],
  "lucky_color": "ชื่อสีมงคล 1 สี เช่น สีเขียวมรกต",
  "lucky_time": "ช่วงเวลามงคล 1 ช่วง เช่น 08:00 - 10:00 น.",
  "love": { "reading": "คำทำนายดวงความรัก เขียนยาวอย่างน้อย 30 คำ", "caution": "สิ่งที่ควรระวังด้านความรัก (ถ้ามี)" },
  "finance": { "reading": "คำทำนายดวงการเงิน เขียนยาวอย่างน้อย 30 คำ", "caution": "สิ่งที่ควรระวังด้านการเงิน (ถ้ามี)" },
  "work": { "reading": "คำทำนายดวงการงาน เขียนยาวอย่างน้อย 30 คำ", "caution": "สิ่งที่ควรระวังด้านการงาน (ถ้ามี)" },
  "energy": "คำอธิบายพลังงานประจำวัน เขียนยาวอย่างน้อย 30 คำ",
  "energy_level": 4
}
ข้อกำหนด:
- tagline: ความยาว 50-80 ตัวอักษร
- love/finance/work: แต่ละด้านมี "reading" (คำทำนาย จำเป็นต้องมี) และ "caution" (สิ่งที่ควรระวัง)
- reading ของ love/finance/work และ energy: แต่ละช่องต้องมีความยาว "อย่างน้อย 30 คำ" เขียนให้มีเนื้อหา ลื่นไหล ให้กำลังใจ ลงรายละเอียด ห้ามสั้นกว่า 30 คำ
- caution: เป็น OPTIONAL ใส่เฉพาะวันที่มีจุดที่ควรระวังจริง ๆ เท่านั้น ถ้าวันนั้นด้านนั้นราบรื่นดีไม่มีอะไรต้องระวัง ให้ใส่เป็นค่าว่าง "" หรือไม่ต้องใส่ key "caution" เลย (อย่าฝืนแต่งให้มีทุกวัน)
- lucky_numbers: ตัวเลขมงคล 3 ชุด (array ความยาว 3) แต่ละชุดเป็นตัวเลข
- energy_level: จำนวนเต็ม 1 ถึง 5 (พลังงานโดยรวมของวัน)
- เนื้อหาทุกฟิลด์เป็นภาษาไทย`

/**
 * Daily cron: at 23:30 generate the NEXT day's horoscope for all 12 zodiac
 * signs and store them in Firestore (one doc per sign per day). Existing records
 * for the target date are skipped, so re-runs are idempotent.
 */
export class GenerateHoroscopeModule implements IScheduleModule {
  readonly name = 'generate-daily-horoscope'
  readonly cronPattern = '30 23 * * *' // 23:30 daily
  readonly timezone = 'Asia/Bangkok'

  async execute(): Promise<void> {
    // 23:30 today → generate for tomorrow.
    const targetDate = getLocalTime().add(1, 'day').format('YYYY-MM-DD')
    await generateHoroscopesForDate(targetDate)
  }
}

/**
 * Generates and stores horoscopes for all 12 zodiac signs for the given date
 * (YYYY-MM-DD). Idempotent: signs that already have a record are skipped.
 */
export async function generateHoroscopesForDate(
  targetDate: string,
): Promise<{ generated: number; skipped: number }> {
  logger.info({ targetDate }, '🔮 [GenerateHoroscopeModule] generating horoscopes...')

  let generated = 0
  let skipped = 0
  for (const sign of ZODIAC_SIGNS) {
    try {
      const created = await generateAndStore(targetDate, sign)
      if (created) generated += 1
      else skipped += 1
    } catch (error) {
      logger.warn({ error, sign: sign.key, targetDate }, '[horoscope] failed to generate for sign')
    }
  }

  logger.info({ targetDate, generated, skipped }, '✅ [GenerateHoroscopeModule] done')
  return { generated, skipped }
}

async function generateAndStore(
  date: string,
  sign: { key: string; name: string; dateRange: string },
): Promise<boolean> {
  const docId = `${date}_${sign.key}`
  const docRef = db.collection(HOROSCOPE_COLLECTION).doc(docId)

  // Idempotent: don't regenerate (and re-spend tokens) if it already exists.
  const existing = await docRef.get()
  if (existing.exists) return false

  // Generate, retrying when the tagline falls outside the allowed length, then
  // hard-clamp as a final guarantee that it never exceeds the max.
  let parsed: IHoroscopeContent | null = null
  for (let attempt = 1; attempt <= TAGLINE_MAX_ATTEMPTS; attempt++) {
    const candidate = await generateContent(date, sign)
    if (!candidate) continue
    parsed = candidate
    const len = candidate.tagline.length
    if (len >= TAGLINE_MIN_CHARS && len <= TAGLINE_MAX_CHARS) break
    logger.info(
      { sign: sign.key, date, attempt, taglineLen: len },
      '[horoscope] tagline length out of range, retrying',
    )
  }
  if (!parsed) {
    logger.warn({ sign: sign.key, date }, '[horoscope] could not parse generated content')
    return false
  }
  parsed.tagline = clampTagline(parsed.tagline)

  await docRef.set({
    date,
    sign_key: sign.key,
    sign: sign.name,
    date_range: sign.dateRange,
    tagline: parsed.tagline,
    lucky_numbers: parsed.lucky_numbers,
    lucky_color: parsed.lucky_color,
    lucky_time: parsed.lucky_time,
    love: parsed.love,
    finance: parsed.finance,
    work: parsed.work,
    energy: parsed.energy,
    energy_level: parsed.energy_level,
    created_at: getUtcTime().toDate(),
  })
  return true
}

/**
 * Ensures a horoscope exists for a single sign on the given date, generating it
 * on demand if missing (idempotent). Used as a fallback when the daily cron
 * hasn't populated the date yet. Returns false if the sign key is unknown.
 */
export async function ensureHoroscopeForSign(date: string, signKey: string): Promise<boolean> {
  const sign = ZODIAC_SIGNS.find((s) => s.key === signKey)
  if (!sign) return false
  const docRef = db.collection(HOROSCOPE_COLLECTION).doc(`${date}_${sign.key}`)
  if ((await docRef.get()).exists) return true
  try {
    return await generateAndStore(date, sign)
  } catch (error) {
    logger.warn({ error, signKey, date }, '[horoscope] on-demand generation failed')
    return false
  }
}

/** One generation attempt: calls the model and parses the result (or null). */
async function generateContent(
  date: string,
  sign: { key: string; name: string; dateRange: string },
): Promise<IHoroscopeContent | null> {
  const ai = new AIService()
  const prompt = `ราศี: ${sign.name} (${sign.dateRange})\nดวงประจำวันที่: ${date}\nกรุณาสร้างคำทำนายสำหรับราศีและวันนี้`
  const response = await ai.generate([{ role: 'user', parts: [{ text: prompt }] }], {
    model: envVariables.GOOGLE_GEMINI_CHAT_MODEL,
    systemInstruction: GENERATION_INSTRUCTION,
    temperature: 0.9,
    responseMimeType: 'application/json',
  })
  const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || ''
  return parseHoroscope(text)
}

/** Guarantees the tagline never exceeds the max; cuts at a word boundary if possible. */
function clampTagline(tagline: string): string {
  const t = tagline.trim()
  if (t.length <= TAGLINE_MAX_CHARS) return t
  const cut = t.slice(0, TAGLINE_MAX_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace >= TAGLINE_MIN_CHARS ? cut.slice(0, lastSpace) : cut).trim()
}

/** A fortune aspect: the reading plus an optional "things to watch out for". */
interface IHoroscopeAspect {
  reading: string
  caution?: string
}

interface IHoroscopeContent {
  tagline: string
  lucky_numbers: string[]
  lucky_color: string
  lucky_time: string
  love: IHoroscopeAspect
  finance: IHoroscopeAspect
  work: IHoroscopeAspect
  energy: string
  energy_level: number
}

function parseHoroscope(text: string): IHoroscopeContent | null {
  if (!text) return null
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    const p = JSON.parse(cleaned) as Record<string, unknown>
    const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

    const tagline = str(p.tagline)
    const love = parseAspect(p.love)
    const finance = parseAspect(p.finance)
    const work = parseAspect(p.work)
    if (!tagline || !love || !finance || !work) return null

    const lucky_numbers = (Array.isArray(p.lucky_numbers) ? p.lucky_numbers : [])
      .map((n) => String(n).trim())
      .filter((n) => n.length > 0)
      .slice(0, 3)
    if (lucky_numbers.length !== 3) return null

    const levelRaw = Number(p.energy_level)
    const energy_level = Number.isFinite(levelRaw) ? Math.min(5, Math.max(1, Math.round(levelRaw))) : 3

    return {
      tagline,
      lucky_numbers,
      lucky_color: str(p.lucky_color),
      lucky_time: str(p.lucky_time),
      love,
      finance,
      work,
      energy: str(p.energy),
      energy_level,
    }
  } catch {
    return null
  }
}

/**
 * Parses a fortune aspect. Accepts either an object {reading, caution} or a
 * plain string (treated as the reading). Returns null if there's no reading.
 * `caution` is omitted entirely when empty/absent.
 */
function parseAspect(v: unknown): IHoroscopeAspect | null {
  if (typeof v === 'string') {
    const reading = v.trim()
    return reading ? { reading } : null
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const reading = typeof o.reading === 'string' ? o.reading.trim() : ''
    if (!reading) return null
    const caution = typeof o.caution === 'string' ? o.caution.trim() : ''
    return caution ? { reading, caution } : { reading }
  }
  return null
}
