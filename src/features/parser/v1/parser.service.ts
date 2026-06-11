import { logger } from '#/common/libs/logger.lib'
import { AIService } from '#/common/services/ai.service'
import { getLocalTime } from '#/common/utils/datetime.util'
import { PARSER_LABELS } from '#/features/parser/v1/parser.type'

import type {
  TParserResponse,
  TParserExtracted,
  TParserScheduleExtract,
  TParserExpenseExtract,
  TParserTodoExtract,
} from '#/features/parser/v1/parser.type'

const EXPENSE_CATEGORIES = ['food&drink', 'transport', 'shopping', 'bills', 'work', 'other'] as const

const SYSTEM_INSTRUCTION_BASE = `You are an intent classifier AND data extractor. Given a single Thai user message, return JSON with TWO things:

1. PROBABILITIES — distribution over 4 labels. The four numbers MUST sum to 1.0 exactly.
   - meeting: ผู้ใช้พูดถึงการประชุม/นัดพบกับคน/ลูกค้า/หมอ/เพื่อน
   - reminder: ผู้ใช้ต้องการตั้งแจ้งเตือนเหตุการณ์/วันสำคัญ/กิจกรรมตามเวลา ที่ไม่ใช่การประชุม
   - expense: ผู้ใช้บันทึก/พูดถึงรายรับ-รายจ่ายหรือเงิน
   - todo: ผู้ใช้พูดถึงสิ่งที่ต้องทำที่ไม่ผูกกับเวลาแน่นอน

2. EXTRACTED — structured data for whichever label has the HIGHEST probability:
   - top=meeting → fill "schedule" object with type:"calendar". Set "expenses" and "todo" to null.
   - top=reminder → fill "schedule" object with type:"reminder". Set "expenses" and "todo" to null.
   - top=expense → fill "expenses" array (one or more items if user mentions multiple). Set "schedule" and "todo" to null.
   - top=todo → fill "todo" object. Set "schedule" and "expenses" to null.
   - If the top probability < 0.5 (ambiguous), set ALL three (schedule, expenses, todo) to null and do NOT guess.

EXTRACTION RULES:
- schedule.title / expenses[].subject / todo.title: short, descriptive Thai phrase summarizing the action (no punctuation noise).
- schedule.scheduled_at: ISO 8601 with +07:00 timezone (e.g. "2026-05-30T10:00:00+07:00"). Convert relative times ("พรุ่งนี้ 10 โมง", "อีก 2 ชม.") to absolute based on the Current Thai local time provided below.
- schedule.end_at: include only if user mentions end time, else null.
- schedule.description / location / invitees / note: include only if explicitly mentioned, else null.
- expenses[].amount: positive number, in THB unless user states otherwise.
- expenses[].category: MUST be one of "food&drink", "transport", "shopping", "bills", "work", "other". Pick the best fit.
- expenses[].date: "YYYY-MM-DD" (default = today's date in Asia/Bangkok if not specified).
- expenses[].time: "HH:mm" only if explicitly mentioned, else null.
- expenses[].currency: "THB" unless user states otherwise.
- expenses[].location: only if mentioned, else null.
- todo.description: only if user gives additional detail, else null.

OUTPUT — return ONLY this JSON, no prose, no markdown fences:
{
  "meeting": <number>,
  "reminder": <number>,
  "expense": <number>,
  "todo": <number>,
  "extracted": {
    "schedule": { "type": "calendar"|"reminder", "title": <string>, "scheduled_at": <ISO>, "end_at": <ISO|null>, "description": <string|null>, "location": <string|null>, "invitees": <string|null>, "note": <string|null> } | null,
    "expenses": [ { "subject": <string>, "amount": <number>, "category": <enum>, "currency": "THB", "location": <string|null>, "date": <YYYY-MM-DD>, "time": <HH:mm|null> } ] | null,
    "todo": { "title": <string>, "description": <string|null> } | null
  }
}`

const EMPTY_EXTRACTED: TParserExtracted = { schedule: null, expenses: null, todo: null }

export class ParserService {
  private aiService: AIService

  constructor() {
    this.aiService = new AIService()
  }

  async classify(message: string): Promise<TParserResponse> {
    const nowStr = getLocalTime().format('YYYY-MM-DDTHH:mm:ssZ')
    const systemInstruction = `${SYSTEM_INSTRUCTION_BASE}\n\nCurrent Thai local time is ${nowStr}.`
    const response = await this.aiService.generate(
      [{ role: 'user', parts: [{ text: message }] }],
      {
        systemInstruction,
        temperature: 0.1,
        responseMimeType: 'application/json',
        meta: { source: 'parser', kind: 'classify' },
      },
    )
    const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || '{}'
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      logger.warn({ error, text }, '[parser] LLM returned non-JSON, falling back to uniform distribution + empty extracted')
    }
    const probabilities = this.normalizeProbabilities(parsed)
    const extracted = this.normalizeExtracted(parsed.extracted, probabilities, nowStr)
    return { ...probabilities, extracted }
  }

  private normalizeProbabilities(
    raw: Record<string, unknown>,
  ): Pick<TParserResponse, 'meeting' | 'reminder' | 'expense' | 'todo'> {
    const values = PARSER_LABELS.map((label) => {
      const v = Number(raw[label])
      return Number.isFinite(v) && v >= 0 ? v : 0
    })
    const sum = values.reduce((a, b) => a + b, 0)
    const uniform = 1 / PARSER_LABELS.length
    const normalized = sum > 0 ? values.map((v) => v / sum) : PARSER_LABELS.map(() => uniform)
    return {
      meeting: normalized[0] ?? uniform,
      reminder: normalized[1] ?? uniform,
      expense: normalized[2] ?? uniform,
      todo: normalized[3] ?? uniform,
    }
  }

  private normalizeExtracted(
    raw: unknown,
    probabilities: Pick<TParserResponse, 'meeting' | 'reminder' | 'expense' | 'todo'>,
    nowStr: string,
  ): TParserExtracted {
    if (!raw || typeof raw !== 'object') return EMPTY_EXTRACTED

    const top = this.pickTopLabel(probabilities)
    if (!top) return EMPTY_EXTRACTED

    const r = raw as Record<string, unknown>
    if (top === 'meeting' || top === 'reminder') {
      const schedule = this.normalizeSchedule(r.schedule, top === 'reminder' ? 'reminder' : 'calendar')
      return { schedule, expenses: null, todo: null }
    }
    if (top === 'expense') {
      const expenses = this.normalizeExpenses(r.expenses, nowStr)
      return { schedule: null, expenses, todo: null }
    }
    const todo = this.normalizeTodo(r.todo)
    return { schedule: null, expenses: null, todo }
  }

  private pickTopLabel(
    p: Pick<TParserResponse, 'meeting' | 'reminder' | 'expense' | 'todo'>,
  ): 'meeting' | 'reminder' | 'expense' | 'todo' | null {
    const entries: Array<['meeting' | 'reminder' | 'expense' | 'todo', number]> = [
      ['meeting', p.meeting],
      ['reminder', p.reminder],
      ['expense', p.expense],
      ['todo', p.todo],
    ]
    entries.sort((a, b) => b[1] - a[1])
    const [topLabel, topProb] = entries[0]!
    return topProb >= 0.5 ? topLabel : null
  }

  private normalizeSchedule(raw: unknown, kind: 'calendar' | 'reminder'): TParserScheduleExtract | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    const scheduledAt = typeof r.scheduled_at === 'string' ? r.scheduled_at : ''
    if (!title || !scheduledAt) return null
    return {
      type: kind,
      title,
      scheduled_at: scheduledAt,
      end_at: typeof r.end_at === 'string' ? r.end_at : null,
      description: typeof r.description === 'string' ? r.description : null,
      location: typeof r.location === 'string' ? r.location : null,
      invitees: typeof r.invitees === 'string' ? r.invitees : null,
      note: typeof r.note === 'string' ? r.note : null,
    }
  }

  private normalizeExpenses(raw: unknown, nowStr: string): TParserExpenseExtract[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null
    const todayDate = nowStr.slice(0, 10)
    const items = raw
      .map((item): TParserExpenseExtract | null => {
        if (!item || typeof item !== 'object') return null
        const r = item as Record<string, unknown>
        const subject = typeof r.subject === 'string' ? r.subject.trim() : ''
        const amount = Number(r.amount)
        if (!subject || !Number.isFinite(amount) || amount < 0) return null
        const rawCategory = typeof r.category === 'string' ? r.category : ''
        const category = (EXPENSE_CATEGORIES as readonly string[]).includes(rawCategory)
          ? (rawCategory as TParserExpenseExtract['category'])
          : 'other'
        return {
          subject,
          amount,
          category,
          currency: typeof r.currency === 'string' && r.currency.length > 0 ? r.currency : 'THB',
          location: typeof r.location === 'string' ? r.location : null,
          date: typeof r.date === 'string' && r.date.length >= 8 ? r.date : todayDate,
          time: typeof r.time === 'string' ? r.time : null,
        }
      })
      .filter((item): item is TParserExpenseExtract => item !== null)
    return items.length > 0 ? items : null
  }

  private normalizeTodo(raw: unknown): TParserTodoExtract | null {
    if (!raw || typeof raw !== 'object') return null
    const r = raw as Record<string, unknown>
    const title = typeof r.title === 'string' ? r.title.trim() : ''
    if (!title) return null
    return {
      title,
      description: typeof r.description === 'string' ? r.description : null,
    }
  }
}
