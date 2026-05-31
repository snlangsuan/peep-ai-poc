import type { BotTask, BotTool } from '../brain.bot'
import type { ExpenseService } from '#/features/expenses/v1/expense.service'
import type { IExpenseArgs, ISummaryArgs } from '../brain.type'
import type { TCreateExpense, TExpenseListFilter } from '#/features/expenses/v1/expense.type'
import { getLocalTime } from '~/src/common/utils/datetime.util'
import { ChatFormatter } from '../chat.formatter'

export const getExpenseTasks = (): BotTask[] => [
  {
    id: 'expenses',
    name: 'Expenses',
    description:
      'Any mention of spending money, buying things, or costs. Always identify the amount, what it was for (subject), WHERE it was bought (location), and the most appropriate CATEGORY (e.g., Food, Travel, Shopping, Utility, Health, Entertainment).',
    guidelines: [
      'For expenses, STRICTLY separate the item (subject) from the shop/place (location). Example: "ซื้อกาแฟที่อเมซอน" -> subject: "กาแฟ", location: "อเมซอน".',
      'For expenses, ALWAYS assign a category. Use your best judgment based on the subject (e.g., "กินข้าว" -> Food, "เติมน้ำมัน" -> Travel).',
      'Ensure the amount is extracted as a pure number. If the currency is not mentioned, assume THB.',
    ],
  },
]

export const handleGetExpenseSummary = async (
  expenseService: ExpenseService,
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

  const result = await expenseService.list(user_id, {
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

export const getExpenseTools = (expenseService: ExpenseService): BotTool[] => [
  {
    name: 'manage_expense',
    declaration: {
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
    handler: async (args, userId) => {
      const expenseArgs = args as IExpenseArgs
      switch (expenseArgs.action) {
        case 'create':
          return expenseService.create(userId, {
            subject: expenseArgs.subject || 'Expense',
            amount: expenseArgs.amount || 0,
            currency: expenseArgs.currency || 'THB',
            location: expenseArgs.location ?? null,
            category: expenseArgs.category ?? null,
            date: expenseArgs.date || getLocalTime().format('YYYY-MM-DD'),
          } as unknown as TCreateExpense)
        case 'update':
          const { id, action, ...data } = expenseArgs
          const updateData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined))
          return expenseService.update(userId, id as string, updateData as Partial<TCreateExpense>)
        default:
          const { action: _, ...rest } = expenseArgs
          return expenseService.list(userId, {
            page: 1,
            limit: 10,
            desc: true,
            ...rest,
          } as unknown as TExpenseListFilter)
      }
    },
  },
  {
    name: 'get_expense_summary',
    declaration: {
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
    handler: async (args, userId) => {
      return handleGetExpenseSummary(expenseService, args as unknown as ISummaryArgs, userId)
    },
  },
]
