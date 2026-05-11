import type { Content, Part, Tool, GenerateContentResponse } from '@google/genai'
import type { AIService } from '#/common/services/ai.service'
import type { ExpenseService } from '#/features/expenses/v1/expense.service'
import type { ScheduleService } from '#/features/schedules/v1/schedule.service'
import type { ChatRepository } from '#/features/chats/v1/chat.repository'
import type { UidService } from '#/features/uid/v1/uid.service'
import type {
  TExpenseResponse,
  TExpenseListResponse,
  TExpenseListFilter,
  TCreateExpense,
} from '#/features/expenses/v1/expense.type'
import type {
  TScheduleResponse,
  TScheduleListResponse,
  TScheduleListFilter,
  TCreateSchedule,
} from '#/features/schedules/v1/schedule.type'
import type { IExpenseArgs, IScheduleArgs, ISummaryArgs, TToolResult } from '#/features/chats/v1/brain.type'
import { getLocalTime } from '~/src/common/utils/datetime.util'
import { ChatFormatter } from '#/features/chats/v1/chat.formatter'
import { logger } from '~/src/common/libs/logger.lib'

export class BrainService {
  constructor(
    private readonly aiService: AIService,
    private readonly expenseService: ExpenseService,
    private readonly scheduleService: ScheduleService,
    private readonly chatRepository: ChatRepository,
    private readonly uidService: UidService,
  ) {}

  private getTools(): Tool[] {
    return [
      {
        functionDeclarations: [
          {
            name: 'manage_expense',
            description:
              'Record or manage personal spending, costs, or money out. Use this when the user mentions buying something, paying for a service, or any money transaction.',
            parameters: {
              type: 'OBJECT',
              properties: {
                action: {
                  type: 'STRING',
                  enum: ['create', 'list', 'update'],
                  description: 'The action to perform. Default is "create" for new mentions.',
                },
                id: { type: 'STRING', description: 'The ID of the expense (required for update).' },
                subject: {
                  type: 'STRING',
                  description: 'What was bought (e.g., "หนังสือ", "Coffee"). DO NOT include the location name here.',
                },
                amount: { type: 'NUMBER', description: 'The numerical value of the expense. Extract only the number.' },
                currency: { type: 'STRING', description: 'The currency code (e.g., THB, USD). Default is THB.' },
                location: {
                  type: 'STRING',
                  description:
                    'The place or shop name (e.g., "7-Eleven", "ร้านนายอินทร์"). Keep it separate from the subject.',
                },
                category: { type: 'STRING', description: 'Broad category (e.g., Food, Travel, Utility).' },
                date: {
                  type: 'STRING',
                  description:
                    'The date the expense occurred (YYYY-MM-DD). Use the User Message Sent At as reference for relative dates like "today" or "yesterday".',
                },
              },
              required: ['action'],
            },
          },
          {
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
          {
            name: 'get_expense_summary',
            description: 'Get a summary of expenses for a specific period.',
            parameters: {
              type: 'OBJECT',
              properties: {
                start_date: { type: 'STRING', description: 'Start date (YYYY-MM-DD).' },
                end_date: { type: 'STRING', description: 'End date (YYYY-MM-DD).' },
              },
            },
          },
          {
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
          {
            name: 'get_overall_summary',
            description: 'Get an overall summary of both expenses and schedules.',
            parameters: {
              type: 'OBJECT',
              properties: {
                start_date: { type: 'STRING', description: 'Start date (YYYY-MM-DD).' },
                end_date: { type: 'STRING', description: 'End date (YYYY-MM-DD).' },
              },
            },
          },
        ],
      },
      {
        googleSearch: {},
      },
    ] as any // The library expects a specific Tool structure, but 'any' here is to bridge the union type if needed, but I will try to use proper typing if possible.
  }

  private async executeTool(name: string, args: Record<string, unknown>, user_id: string): Promise<TToolResult> {
    switch (name) {
      case 'manage_expense':
        return this.handleManageExpense(args as unknown as IExpenseArgs, user_id)
      case 'manage_schedule':
        return this.handleManageSchedule(args as unknown as IScheduleArgs, user_id)
      case 'get_expense_summary':
        return this.handleGetExpenseSummary(args as unknown as ISummaryArgs, user_id)
      case 'get_schedule_summary':
        return this.handleGetScheduleSummary(args as unknown as ISummaryArgs, user_id)
      case 'get_overall_summary':
        return this.handleGetOverallSummary(args as unknown as ISummaryArgs, user_id)
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }

  private async handleManageExpense(
    args: IExpenseArgs,
    user_id: string,
  ): Promise<TExpenseResponse | TExpenseListResponse | null> {
    switch (args.action) {
      case 'create':
        return this.handleCreateExpense(user_id, args)
      case 'update':
        return this.handleUpdateExpense(user_id, args)
      default:
        return this.handleListExpenses(user_id, args)
    }
  }

  private async handleCreateExpense(user_id: string, data: IExpenseArgs) {
    return this.expenseService.create(user_id, {
      subject: data.subject || 'Expense',
      amount: data.amount || 0,
      currency: data.currency || 'THB',
      location: data.location ?? null,
      category: data.category ?? null,
      date: data.date || getLocalTime().format('YYYY-MM-DD'),
    } as unknown as TCreateExpense)
  }

  private async handleUpdateExpense(user_id: string, args: IExpenseArgs) {
    const { id, action, ...data } = args
    const updateData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined))
    return this.expenseService.update(user_id, id as string, updateData as Partial<TCreateExpense>)
  }

  private async handleListExpenses(user_id: string, filter: IExpenseArgs) {
    const { action, ...rest } = filter
    return this.expenseService.list(user_id, {
      page: 1,
      limit: 10,
      desc: true,
      ...rest,
    } as unknown as TExpenseListFilter)
  }

  private async handleManageSchedule(
    args: IScheduleArgs,
    user_id: string,
  ): Promise<TScheduleResponse | TScheduleListResponse | null> {
    switch (args.action) {
      case 'create':
        return this.handleCreateSchedule(user_id, args)
      case 'update':
        return this.handleUpdateSchedule(user_id, args)
      default:
        return this.handleListSchedules(user_id, args)
    }
  }

  private async handleCreateSchedule(user_id: string, data: IScheduleArgs) {
    return this.scheduleService.create(user_id, {
      title: data.title || 'New Schedule',
      date: data.date || getLocalTime().format('YYYY-MM-DD'),
      time: data.time || null,
      location: data.location || null,
      remind_before_minutes: data.remind_before_minutes ?? 15,
    } as unknown as TCreateSchedule)
  }

  private async handleUpdateSchedule(user_id: string, args: IScheduleArgs) {
    const { id, action, ...data } = args
    const updateData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined))
    return this.scheduleService.update(user_id, id as string, updateData as Partial<TCreateSchedule>)
  }

  private async handleListSchedules(user_id: string, filter: IScheduleArgs) {
    const { action, ...rest } = filter
    return this.scheduleService.list(user_id, {
      page: 1,
      limit: 10,
      desc: true,
      ...rest,
    } as unknown as TScheduleListFilter)
  }

  private async handleGetExpenseSummary(args: ISummaryArgs, user_id: string): Promise<string> {
    const s = getLocalTime(args.start_date || getLocalTime().startOf('day'))
    const e = getLocalTime(args.end_date || getLocalTime().endOf('day'))

    if (e.diff(s, 'day') > 30) {
      return 'ขออภัยครับ เพื่อให้ข้อมูลอ่านง่ายและไม่ยาวจนเกินไป ผมแนะนำให้ระบุช่วงสรุปข้อมูลไม่เกิน 30 วันนะครับ รบกวนลองปรับช่วงวันที่อีกนิด เดี๋ยวผมรีบสรุปให้เลยครับ! 😊'
    }

    if (e.diff(s, 'day') > 365) {
      return 'ขอโทษทีครับ ระบบสามารถดึงข้อมูลย้อนหลังได้สูงสุด 1 ปีครับ รบกวนลองเลือกช่วงเวลาที่สั้นลงอีกนิดนะครับ เดี๋ยวผมจัดการให้เลยครับ! ✨'
    }

    const startDate = s.format('YYYY-MM-DD')
    const endDate = e.format('YYYY-MM-DD')

    const result = await this.expenseService.list(user_id, {
      page: 1,
      limit: 100,
      start_date: startDate,
      end_date: endDate,
      sort: 'date',
      desc: false,
    })

    const dateRangeStr = ChatFormatter.formatDateRange(startDate, endDate)
    return ChatFormatter.formatExpenseList(result, dateRangeStr)
  }

  private async handleGetScheduleSummary(args: ISummaryArgs, user_id: string): Promise<string> {
    const s = getLocalTime(args.start_date || getLocalTime().startOf('day'))
    const e = getLocalTime(args.end_date || getLocalTime().endOf('day'))

    if (e.diff(s, 'day') > 30) {
      return 'ขออภัยครับ เพื่อให้ข้อมูลอ่านง่ายและไม่ยาวจนเกินไป ผมแนะนำให้ระบุช่วงสรุปข้อมูลไม่เกิน 30 วันนะครับ รบกวนลองปรับช่วงวันที่อีกนิด เดี๋ยวผมรีบสรุปให้เลยครับ! 😊'
    }

    if (e.diff(s, 'day') > 365) {
      return 'ขอโทษทีครับ ระบบสามารถดึงข้อมูลย้อนหลังได้สูงสุด 1 ปีครับ รบกวนลองเลือกช่วงเวลาที่สั้นลงอีกนิดนะครับ เดี๋ยวผมจัดการให้เลยครับ! ✨'
    }

    const startDate = s.format('YYYY-MM-DD')
    const endDate = e.format('YYYY-MM-DD')

    const result = await this.scheduleService.list(user_id, {
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

  private async handleGetOverallSummary(args: ISummaryArgs, user_id: string): Promise<string> {
    const expenseText = await this.handleGetExpenseSummary(args, user_id)
    const scheduleText = await this.handleGetScheduleSummary(args, user_id)

    const rawData = `Expenses:\n${expenseText}\n\nSchedules:\n${scheduleText}`
    const analysis = await this.aiService.summarize(
      rawData,
      'Analyze the following expenses and schedules. Provide a natural, friendly summary in Thai. Highlight important trends or upcoming busy days.',
    )
    return analysis
  }

  async process(user_id: string, message: string, display_name?: string, sent_at?: string | Date): Promise<void> {
    const referenceDate = sent_at ? getLocalTime(sent_at) : getLocalTime()
    const tools = this.getTools()
    const systemPrompt = `You are a helpful AI assistant and an expert data extractor for ${display_name || 'the user'} (ID: ${user_id}).
Current System Time: ${getLocalTime().format('YYYY-MM-DD HH:mm:ss (Thailand Time)')}
User Message Sent At: ${referenceDate.format('YYYY-MM-DD HH:mm:ss (Thailand Time)')}

Your primary goal is to accurately extract expenses and schedules from user messages.
- Expenses: Any mention of spending money, buying things, or costs. Always identify the amount, what it was for (subject), WHERE it was bought (location), and the most appropriate CATEGORY (e.g., Food, Travel, Shopping, Utility, Health, Entertainment).
- Schedules: Any mention of appointments, meetings, events, or plans. Always identify the date and time.

GUIDELINES:
1. Be precise with dates. Use "User Message Sent At" as the absolute reference for relative dates like "today", "tomorrow", or "next Monday".
2. For expenses, STRICTLY separate the item (subject) from the shop/place (location). Example: "ซื้อกาแฟที่อเมซอน" -> subject: "กาแฟ", location: "อเมซอน".
3. For expenses, ALWAYS assign a category. Use your best judgment based on the subject (e.g., "กินข้าว" -> Food, "เติมน้ำมัน" -> Travel).
4. Ensure the amount is extracted as a pure number. If the currency is not mentioned, assume THB.
3. For schedules, if a specific time is not mentioned, leave it empty or use common sense (e.g., "dinner" is evening).
4. If a user message contains multiple items, call the appropriate tools multiple times.
5. When summarizing, present the tool's response exactly as provided.
6. Always respond in a friendly, helpful Thai language. Address the user as ${display_name || 'คุณ'}.
7. ALWAYS respond in PLAIN TEXT. NO Markdown (no **, _, \`, or links). Use \\n for breaks.`

    // Fetch last 5 messages for multi-turn context
    const chatHistorySnapshot = await this.chatRepository.list(user_id, {
      page: 1,
      limit: 5,
      sort: 'created_at',
      desc: true,
    })
    const history: Content[] = chatHistorySnapshot.items
      .reverse() // Firestore returns newest first, Gemini needs oldest first
      .map((item) => ({
        role: item.sender_id === user_id ? 'user' : 'model',
        parts: [{ text: item.message }],
      }))

    // Add current message to history
    history.push({ role: 'user', parts: [{ text: message }] })

    console.log('prompt', systemPrompt + '\n\nHistory Length: ' + history.length)

    try {
      // 1. Check Credits
      const profile = await this.uidService.getProfile(user_id)
      const currentCredits = profile?.credits ?? 0

      if (currentCredits <= 0) {
        await this.chatRepository.send(user_id, 'bot', {
          message: 'ขออภัยครับ ดูเหมือนเครดิตของคุณจะหมดแล้ว 😊 สามารถเติมเครดิตเพื่อใช้งาน Peep AI ต่อได้ทันทีเลยนะครับ',
        })
        return
      }

      let result = await this.aiService.chatbot(history, systemPrompt, tools)
      console.log('result', JSON.stringify(result))

      let candidate = result.candidates?.[0]
      let turnCount = 0
      const MAX_TURNS = 5
      const executedToolsInTurn = new Set<string>()

      // console.log(candidate?.content?.parts)
      while (candidate?.content?.parts?.some((p: Part) => p.functionCall) && turnCount < MAX_TURNS) {
        turnCount++
        const parts = candidate.content.parts.filter((p: Part) => p.functionCall)

        // If it's a single tool call and it's a summary tool, we might want to return directly
        const isSingleTool = parts.length === 1
        const toolName = parts[0]?.functionCall?.name

        const toolResponses = await this.handleToolTurn(candidate.content.parts, user_id, executedToolsInTurn)

        // If it was a single summary tool call, and we got a string back, send it directly
        if (
          isSingleTool &&
          ['get_expense_summary', 'get_schedule_summary', 'get_overall_summary'].includes(toolName || '')
        ) {
          const directMessage = toolResponses[0]?.functionResponse?.response as unknown as string
          if (typeof directMessage === 'string') {
            await this.uidService.deductCredit(user_id, 1)
            await this.chatRepository.send(user_id, 'bot', { message: directMessage })
            return // Stop processing
          }
        }

        result = await this.aiService.chatbot(
          [...history, candidate.content, { role: 'user', parts: toolResponses }],
          systemPrompt,
          tools,
        )
        console.log('result', JSON.stringify(result))
        candidate = result.candidates?.[0]
      }

      const finalText = candidate?.content?.parts?.find((p: Part) => p.text)?.text
      if (finalText) {
        // 2. Deduct Credit before sending message to avoid race condition in SSE
        await this.uidService.deductCredit(user_id, 1)

        await this.chatRepository.send(user_id, 'bot', { message: finalText })
      }
    } catch (error) {
      console.log(error)
      logger.error({ error }, 'Error in BrainService processing')
      await this.chatRepository.send(user_id, 'bot', {
        message: 'ขออภัยด้วยนะครับ พอดีเกิดข้อผิดพลาดนิดหน่อยระหว่างประมวลผล รบกวนคุณลองพิมพ์ข้อความใหม่อีกครั้งนะครับ 🙏',
      })
    }
  }

  private async handleToolTurn(parts: Part[], user_id: string, executedToolsInTurn: Set<string>): Promise<Part[]> {
    const toolResponses: Part[] = []

    for (const part of parts) {
      if (!part.functionCall) continue
      const { name, args } = part.functionCall
      if (!name) continue

      const callSignature = `${name}:${JSON.stringify(args)}`

      // 1. Skip if already executed in THIS turn
      if (executedToolsInTurn.has(callSignature)) {
        toolResponses.push({
          functionResponse: { name, response: { status: 'already_executed', message: 'You already called this.' } },
        })
        continue
      }

      const toolResult = await this.executeTool(name, args as Record<string, unknown>, user_id)
      executedToolsInTurn.add(callSignature)
      toolResponses.push({
        functionResponse: { name, response: (toolResult || { status: 'success' }) as any },
      })
    }
    return toolResponses
  }

  private getScheduleTimes(parts: Part[]): Set<string> {
    const scheduleTimes = new Set<string>()
    for (const p of parts) {
      if (p.functionCall?.name === 'manage_schedule') {
        const args = p.functionCall.args as unknown as IScheduleArgs
        if (args.action === 'create') {
          scheduleTimes.add(`${args.date} ${args.time || ''}`.trim())
        }
      }
    }
    return scheduleTimes
  }
}
