import { createHash } from 'node:crypto'

import { CLOUDY_PERSONA } from '#/common/constants/chat.constant'
import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { convertToLocalTime, getUtcTime } from '#/common/utils/datetime.util'
import { AccountRepository } from '#/features/account/v1/account.repository'
import { AccountService } from '#/features/account/v1/account.service'
import { resolvePeriod } from '#/features/summaries/v1/summary.period'

import type { AIService } from '#/common/services/ai.service'
import type { IPeriodInput, IResolvedPeriod } from '#/features/summaries/v1/summary.period'
import type { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import type { IExpenseEntity } from '#/features/expenses/v1/expense.type'
import type { MoodRepository } from '#/features/moods/v1/mood.repository'
import type { IMoodEntity } from '#/features/moods/v1/mood.type'
import type { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import type { TScheduleResponse } from '#/features/schedules/v1/schedule.type'
import type { TSummaryMonthlyResponse, TSummaryMoodCount } from '#/features/summaries/v1/summary.type'
import type { TodoRepository } from '#/features/todos/v1/todo.repository'

interface ITodoDoc {
  uuid: string
  title: string
  completed: boolean
  created_at: string
}

interface IAggregatedStats {
  todoCount: number
  todoCompleted: number
  scheduleCount: number
  expenseCount: number
  expenseTotal: number
  incomeTotal: number
  mood: TSummaryMoodCount[]
}

interface IInsightContext {
  period: string
  stats: {
    todos: { total: number; completed: number; completion_rate: number; sample: string[] }
    schedules: { total: number; sample: string[] }
    expenses: {
      count: number
      total: number
      income_total: number
      net_total: number
      by_category: Record<string, number>
      top: Array<{ subject: string; amount: number }>
    }
    mood: Record<string, number>
  }
}

const MAX_SAMPLE_ITEMS = 5
const MAX_TOP_EXPENSES = 5
const DEFAULT_USERNAME = 'ปี๊บ'
const INSIGHT_CACHE_COLLECTION = 'summary_insight_cache'
/** Bump เมื่อ persona / TASK_INSTRUCTION / output schema เปลี่ยน เพื่อ invalidate cache เก่า */
const INSIGHT_PROMPT_VERSION = 2

const TASK_INSTRUCTION = `Task: คลาวดี้กำลังสร้าง insight สรุปการใช้ชีวิตของ user ในช่วงเวลาที่กำหนด จากสถิติที่ส่งมา

Output rules:
- ห้ามใช้ markdown ห้ามขึ้นต้นด้วย bullet หรือเลขลำดับใน string
- highlight 5 ข้อ แต่ละข้อ 1-2 ประโยค ไม่เกิน 25 คำ ห้ามทวนตัวเลขซ้ำกับข้ออื่น
- recommend 1 ข้อ ระบุสิ่งที่ user ควรทำต่อใน 1-2 ประโยค actionable
- ปฏิบัติตามกฎ persona ทุกข้อ (no Thai sentence-ending particles, no gendered pronouns, address as "คุณ {{USERNAME}}")
- ตอบกลับเป็น JSON เท่านั้น schema:
  { "highlight": ["string", "string", "string", "string", "string"], "recommend": "string" }`

export class SummaryService {
  constructor(
    private readonly todoRepo: TodoRepository,
    private readonly scheduleRepo: ScheduleRepository,
    private readonly expenseRepo: ExpenseRepository,
    private readonly moodRepo: MoodRepository,
    private readonly aiService: AIService,
  ) {}

  /** Backward-compatible monthly summary — delegates to the generic period path. */
  async getMonthly(userId: string, year: number, month: number): Promise<TSummaryMonthlyResponse> {
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = getUtcTime(monthStart).endOf('month').format('YYYY-MM-DD')
    return this.getByPeriod(userId, { start_date: monthStart, end_date: monthEnd })
  }

  /**
   * Aggregates todos, schedules, expenses and moods over a resolved period and
   * produces the AI insight. Accounting carry-over (opening/closing/budget) is
   * only filled for a full calendar month; other periods report period net only.
   */
  async getByPeriod(userId: string, input: IPeriodInput): Promise<TSummaryMonthlyResponse> {
    const period = resolvePeriod(input)
    const { startDate, endDate } = period

    const [username, todos, schedules, expenses, moods] = await Promise.all([
      this.loadUsername(userId),
      this.fetchTodosInRange(userId, startDate, endDate),
      this.fetchSchedules(userId, startDate, endDate),
      this.fetchExpenses(userId, startDate, endDate),
      this.fetchMoods(userId, startDate, endDate),
    ])

    const stats = this.aggregate(todos, schedules, expenses, moods)
    const context = this.buildInsightContext(period, todos, schedules, expenses, moods, stats)
    const insight = await this.resolveInsight(userId, period, username, context)
    const balance = await this.resolveBalance(userId, period)

    return {
      period: period.key,
      start_date: startDate,
      end_date: endDate,
      todo_count: stats.todoCount,
      todo_completed: stats.todoCompleted,
      schedule_count: stats.scheduleCount,
      expense_count: stats.expenseCount,
      expense_total: stats.expenseTotal,
      income_total: stats.incomeTotal,
      net_total: stats.incomeTotal - stats.expenseTotal,
      opening_balance: balance.opening,
      closing_balance: balance.closing,
      budget: balance.budget,
      mood: stats.mood,
      highlight: insight.highlight,
      recommend: insight.recommend,
    }
  }

  /** Accounting carry-over only applies to a full month; null for other periods. */
  private async resolveBalance(
    userId: string,
    period: IResolvedPeriod,
  ): Promise<{ opening: number | null; closing: number | null; budget: number | null }> {
    if (!period.isFullMonth) {
      return { opening: null, closing: null, budget: null }
    }
    const accountService = new AccountService(new AccountRepository(), this.expenseRepo)
    const balance = await accountService.getBalance(userId, `${period.year}-${String(period.month).padStart(2, '0')}`)
    return { opening: balance.opening_balance, closing: balance.closing_balance, budget: balance.budget }
  }

  private async loadUsername(userId: string): Promise<string> {
    try {
      const doc = await db.collection('users').doc(userId).get()
      if (doc.exists) {
        const username = doc.data()?.username
        if (typeof username === 'string' && username.trim().length > 0) {
          return username.trim()
        }
      }
    } catch (error) {
      logger.warn({ error, userId }, '[summary] failed to load username, using default')
    }
    return DEFAULT_USERNAME
  }

  private async fetchTodosInRange(userId: string, startDate: string, endDate: string): Promise<ITodoDoc[]> {
    const { data } = await this.todoRepo.findByUserId(userId)
    return data
      .map((d) => ({
        uuid: String(d.uuid ?? ''),
        title: String(d.title ?? ''),
        completed: Boolean(d.completed),
        created_at: String(d.created_at ?? ''),
      }))
      .filter((t) => {
        if (!t.created_at) return false
        const localDate = convertToLocalTime(t.created_at).format('YYYY-MM-DD')
        return localDate >= startDate && localDate <= endDate
      })
  }

  private async fetchSchedules(userId: string, startDate: string, endDate: string): Promise<TScheduleResponse[]> {
    const { data } = await this.scheduleRepo.findByUserId(userId, {
      start_date: startDate,
      end_date: endDate,
      page: 1,
      limit: 10000,
      sort: 'scheduled_at',
      desc: false,
    })
    return data
  }

  private async fetchExpenses(userId: string, startDate: string, endDate: string): Promise<IExpenseEntity[]> {
    const { data } = await this.expenseRepo.list(userId, {
      start_date: startDate,
      end_date: endDate,
      page: 1,
      limit: 10000,
      sort: 'date',
      desc: false,
    })
    return data
  }

  private async fetchMoods(userId: string, startDate: string, endDate: string): Promise<IMoodEntity[]> {
    const { data } = await this.moodRepo.list(userId, {
      start_date: startDate,
      end_date: endDate,
      page: 1,
      limit: 10000,
      sort: 'date',
      desc: false,
    })
    return data
  }

  private aggregate(
    todos: ITodoDoc[],
    schedules: TScheduleResponse[],
    expenses: IExpenseEntity[],
    moods: IMoodEntity[],
  ): IAggregatedStats {
    const moodCountMap = new Map<string, number>()
    for (const m of moods) {
      moodCountMap.set(m.emotion, (moodCountMap.get(m.emotion) ?? 0) + 1)
    }
    const mood = Array.from(moodCountMap.entries())
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count)

    const expenseRecords = expenses.filter((e) => (e.type ?? 'expense') === 'expense')
    const incomeRecords = expenses.filter((e) => (e.type ?? 'expense') === 'income')

    return {
      todoCount: todos.length,
      todoCompleted: todos.filter((t) => t.completed).length,
      scheduleCount: schedules.length,
      expenseCount: expenseRecords.length,
      expenseTotal: expenseRecords.reduce((sum, e) => sum + (e.amount ?? 0), 0),
      incomeTotal: incomeRecords.reduce((sum, e) => sum + (e.amount ?? 0), 0),
      mood,
    }
  }

  private buildInsightContext(
    period: IResolvedPeriod,
    todos: ITodoDoc[],
    schedules: TScheduleResponse[],
    expenses: IExpenseEntity[],
    moods: IMoodEntity[],
    stats: IAggregatedStats,
  ): IInsightContext {
    // Category breakdown and "top expenses" cover spending only — income is reported separately.
    const expenseRecords = expenses.filter((e) => (e.type ?? 'expense') === 'expense')
    const byCategory: Record<string, number> = {}
    for (const e of expenseRecords) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + (e.amount ?? 0)
    }
    const topExpenses = [...expenseRecords]
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
      .slice(0, MAX_TOP_EXPENSES)
      .map((e) => ({ subject: e.subject, amount: e.amount }))

    const moodObj: Record<string, number> = {}
    for (const m of stats.mood) moodObj[m.id] = m.count

    return {
      period: `${period.startDate}..${period.endDate}`,
      stats: {
        todos: {
          total: stats.todoCount,
          completed: stats.todoCompleted,
          completion_rate: stats.todoCount > 0 ? Math.round((stats.todoCompleted / stats.todoCount) * 100) : 0,
          sample: todos
            .slice(0, MAX_SAMPLE_ITEMS)
            .map((t) => t.title)
            .filter(Boolean),
        },
        schedules: {
          total: stats.scheduleCount,
          sample: schedules
            .slice(0, MAX_SAMPLE_ITEMS)
            .map((s) => s.payload.title)
            .filter(Boolean),
        },
        expenses: {
          count: stats.expenseCount,
          total: stats.expenseTotal,
          income_total: stats.incomeTotal,
          net_total: stats.incomeTotal - stats.expenseTotal,
          by_category: byCategory,
          top: topExpenses,
        },
        mood: moodObj,
      },
    }
  }

  private buildInsightHash(username: string, context: IInsightContext): string {
    const payload = JSON.stringify({
      v: INSIGHT_PROMPT_VERSION,
      username,
      period: context.period,
      stats: context.stats,
    })
    return createHash('sha256').update(payload).digest('hex')
  }

  private cacheDocId(userId: string, period: IResolvedPeriod): string {
    return `${userId}_${period.startDate}_${period.endDate}`
  }

  private async resolveInsight(
    userId: string,
    period: IResolvedPeriod,
    username: string,
    context: IInsightContext,
  ): Promise<{ highlight: string[]; recommend: string }> {
    const hash = this.buildInsightHash(username, context)
    const docId = this.cacheDocId(userId, period)

    const cached = await this.readCachedInsight(docId, hash)
    if (cached) {
      logger.info({ userId, period: context.period }, '[summary] insight cache hit')
      return cached
    }

    const insight = await this.generateInsight(username, context)
    await this.writeCachedInsight(docId, userId, period, hash, insight)
    return insight
  }

  private async readCachedInsight(
    docId: string,
    hash: string,
  ): Promise<{ highlight: string[]; recommend: string } | null> {
    try {
      const doc = await db.collection(INSIGHT_CACHE_COLLECTION).doc(docId).get()
      if (!doc.exists) return null
      const data = doc.data()
      if (!data || data.context_hash !== hash) return null
      if (!Array.isArray(data.highlight) || typeof data.recommend !== 'string') return null
      const highlight = data.highlight.filter((h: unknown): h is string => typeof h === 'string')
      return { highlight, recommend: data.recommend }
    } catch (error) {
      logger.warn({ error, docId }, '[summary] failed to read insight cache')
      return null
    }
  }

  private async writeCachedInsight(
    docId: string,
    userId: string,
    period: IResolvedPeriod,
    hash: string,
    insight: { highlight: string[]; recommend: string },
  ): Promise<void> {
    try {
      await db.collection(INSIGHT_CACHE_COLLECTION).doc(docId).set({
        user_id: userId,
        start_date: period.startDate,
        end_date: period.endDate,
        context_hash: hash,
        prompt_version: INSIGHT_PROMPT_VERSION,
        highlight: insight.highlight,
        recommend: insight.recommend,
        generated_at: getUtcTime().toDate(),
      })
    } catch (error) {
      logger.warn({ error, docId }, '[summary] failed to write insight cache')
    }
  }

  private buildSystemInstruction(username: string): string {
    const userProfile = `User Profile:
- Username: ${username}
- Always address the user as "คุณ ${username}" in Thai output. NEVER use bare "คุณ", "คุณคนนี้", or any placeholder.`
    const task = TASK_INSTRUCTION.replace('{{USERNAME}}', username)
    return `${CLOUDY_PERSONA}\n\n${userProfile}\n\n${task}`
  }

  private async generateInsight(
    username: string,
    context: IInsightContext,
  ): Promise<{ highlight: string[]; recommend: string }> {
    const fallback = this.buildFallbackInsight(username, context)
    try {
      const prompt = `ข้อมูลสรุปช่วง ${context.period}:\n${JSON.stringify(context.stats)}`
      const response = await this.aiService.generate([{ role: 'user', parts: [{ text: prompt }] }], {
        systemInstruction: this.buildSystemInstruction(username),
        temperature: 0.5,
        responseMimeType: 'application/json',
        meta: { source: 'summary', kind: 'monthly-insight' },
      })
      const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || ''
      const parsed = JSON.parse(text) as { highlight?: unknown; recommend?: unknown }
      const highlight = Array.isArray(parsed.highlight)
        ? parsed.highlight.filter((h): h is string => typeof h === 'string' && h.trim().length > 0).slice(0, 5)
        : []
      const recommend = typeof parsed.recommend === 'string' ? parsed.recommend.trim() : ''
      if (highlight.length === 0 || recommend.length === 0) {
        logger.warn({ period: context.period }, '[summary] AI returned empty insight, using fallback')
        return fallback
      }
      return { highlight, recommend }
    } catch (error) {
      logger.warn({ error, period: context.period }, '[summary] AI insight generation failed, using fallback')
      return fallback
    }
  }

  private buildFallbackInsight(username: string, context: IInsightContext): { highlight: string[]; recommend: string } {
    const { stats } = context
    const totalMood = Object.values(stats.mood).reduce((a, b) => a + b, 0)
    const highlight: string[] = [
      `ช่วงนี้คุณ ${username} มี todo ${stats.todos.total} รายการ เสร็จไปแล้ว ${stats.todos.completed} รายการ (${stats.todos.completion_rate}%)`,
      `มีตารางนัดหมาย ${stats.schedules.total} รายการ`,
      `รายจ่าย ${stats.expenses.total.toLocaleString()} บาท รายรับ ${stats.expenses.income_total.toLocaleString()} บาท (สุทธิ ${stats.expenses.net_total.toLocaleString()} บาท)`,
      `บันทึกอารมณ์ ${totalMood} ครั้ง`,
      `ข้อมูลเหล่านี้สะท้อนภาพรวมการใช้ชีวิตของคุณ ${username} ในช่วงที่ผ่านมา`,
    ]
    const recommend = `คุณ ${username} ลองตั้งเป้าหมายช่วงถัดไปโดยอ้างอิงจาก insight ข้างต้น เพื่อบาลานซ์งาน เงิน และสุขภาพใจ`
    return { highlight, recommend }
  }
}
