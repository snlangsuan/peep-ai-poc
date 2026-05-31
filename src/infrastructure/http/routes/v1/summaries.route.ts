import { Hono } from 'hono'

import { AIService } from '#/common/services/ai.service'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import { MoodRepository } from '#/features/moods/v1/mood.repository'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import { SummaryController } from '#/features/summaries/v1/summary.controller'
import { monthlyDoc } from '#/features/summaries/v1/summary.openapi'
import { summaryMonthlyPayloadSchema } from '#/features/summaries/v1/summary.schema'
import { SummaryService } from '#/features/summaries/v1/summary.service'
import { TodoRepository } from '#/features/todos/v1/todo.repository'
import { UserRepository } from '#/features/users/v1/user.repository'
import { authMiddleware } from '#/infrastructure/http/middlewares/auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'

import type { Bindings, Variables } from '#/common/types/app.type'

const summariesGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const userRepository = new UserRepository()
const todoRepository = new TodoRepository()
const scheduleRepository = new ScheduleRepository()
const expenseRepository = new ExpenseRepository()
const moodRepository = new MoodRepository()
const aiService = new AIService()
const service = new SummaryService(
  todoRepository,
  scheduleRepository,
  expenseRepository,
  moodRepository,
  aiService,
)
const controller = new SummaryController(service)

summariesGroup.use('*', authMiddleware(userRepository))

summariesGroup.post('/monthly', monthlyDoc, zValidator('json', summaryMonthlyPayloadSchema), controller.monthly)

export default summariesGroup
