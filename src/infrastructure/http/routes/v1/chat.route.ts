import { Hono } from 'hono'

import { zValidator } from '#/core/middlewares/validator.middleware'
import { ChatController } from '#/features/chats/v1/chat.controller'
import {
  actionExpensesDoc,
  actionSchedulesDoc,
  actionOverallSummaryDoc,
  listChatDoc,
  sendChatDoc,
  streamChatDoc,
} from '#/features/chats/v1/chat.openapi'
import { ChatRepository } from '#/features/chats/v1/chat.repository'
import {
  chatActionRequestBodyPayloadSchema,
  chatListFilterSchema,
  chatStreamFilterSchema,
  sendMessageSchema,
} from '#/features/chats/v1/chat.schema'
import { ChatService } from '#/features/chats/v1/chat.service'
import { BrainService } from '#/features/chats/v1/brain.service'
import { ExpenseService } from '#/features/expenses/v1/expense.service'
import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'
import { ScheduleService } from '#/features/schedules/v1/schedule.service'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import { UidService } from '#/features/uid/v1/uid.service'
import { UidRepository } from '#/features/uid/v1/uid.repository'
import { authMiddleware } from '#/core/middlewares/auth.middleware'

import { AIService } from '#/common/services/ai.service'

// Repositories
const chatRepository = new ChatRepository()
const expenseRepository = new ExpenseRepository()
const scheduleRepository = new ScheduleRepository()
const uidRepository = new UidRepository()

// Services
const aiService = new AIService()
const expenseService = new ExpenseService(expenseRepository)
const scheduleService = new ScheduleService(scheduleRepository)
const uidService = new UidService(uidRepository)

const brainService = new BrainService(aiService, expenseService, scheduleService, chatRepository, uidService)

const chatService = new ChatService(chatRepository, brainService, uidRepository, expenseService, scheduleService)
const chatController = new ChatController(chatService)

const chatRoute = new Hono()

chatRoute.use('*', authMiddleware())

chatRoute.post('/', sendChatDoc, zValidator('json', sendMessageSchema), chatController.send)
chatRoute.get('/', listChatDoc, zValidator('query', chatListFilterSchema), chatController.list)
chatRoute.get('/stream', streamChatDoc, zValidator('query', chatStreamFilterSchema), chatController.stream)

chatRoute.post(
  '/actions/expenses',
  actionExpensesDoc,
  zValidator('json', chatActionRequestBodyPayloadSchema),
  chatController.actionExpenses,
)
chatRoute.post(
  '/actions/schedules',
  actionSchedulesDoc,
  zValidator('json', chatActionRequestBodyPayloadSchema),
  chatController.actionSchedules,
)
chatRoute.post(
  '/actions/overall',
  actionOverallSummaryDoc,
  zValidator('json', chatActionRequestBodyPayloadSchema),
  chatController.actionOverallSummary,
)

export default chatRoute
