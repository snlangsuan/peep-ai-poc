import { Hono } from 'hono'

import { authMiddleware } from '#/infrastructure/http/middlewares/auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'
import { ChatController } from '#/features/chats/v1/chat.controller'
import {
  listChatDoc,
  sendChatDoc,
  streamChatDoc,
  triggerActionDoc,
  updateMoodDoc,
  updateFeedbackDoc,
  sendMoodCardDoc,
  recordMoodByLinkDoc,
} from '#/features/chats/v1/chat.openapi'
import { ChatRepository } from '#/features/chats/v1/chat.repository'
import {
  chatCreatePayloadSchema,
  chatFilterPayloadSchema,
  chatActionPayloadSchema,
  chatMoodUpdatePayloadSchema,
  chatMoodLinkQuerySchema,
  chatMoodSendPayloadSchema,
  chatFeedbackPayloadSchema,
} from '#/features/chats/v1/chat.schema'
import { ChatService } from '#/features/chats/v1/chat.service'

const chatRepository = new ChatRepository()
const chatService = new ChatService(chatRepository)
const chatController = new ChatController(chatService)

const chatRoute = new Hono()

// Public endpoints — sid in query acts as the one-time token for /mood,
// and /mood/send is a testing helper that pushes mood cards by uid in body.
chatRoute.get('/mood', recordMoodByLinkDoc, zValidator('query', chatMoodLinkQuerySchema), chatController.recordMoodByLink)
chatRoute.post('/mood/send', sendMoodCardDoc, zValidator('json', chatMoodSendPayloadSchema), chatController.sendMoodCard)

chatRoute.use('*', authMiddleware())

chatRoute.post('/', sendChatDoc, zValidator('json', chatCreatePayloadSchema), chatController.send)
chatRoute.post('/actions', triggerActionDoc, zValidator('json', chatActionPayloadSchema), chatController.triggerAction)
chatRoute.post('/mood', updateMoodDoc, zValidator('json', chatMoodUpdatePayloadSchema), chatController.updateMood)
chatRoute.post('/feedback', updateFeedbackDoc, zValidator('json', chatFeedbackPayloadSchema), chatController.updateFeedback)
chatRoute.get('/', listChatDoc, zValidator('query', chatFilterPayloadSchema), chatController.list)
chatRoute.get('/stream', streamChatDoc, chatController.stream)
// Manual trigger to fire the morning daily-briefing toast to the caller (testing/ops).
chatRoute.post('/briefing/test', chatController.triggerDailyBriefing)

export default chatRoute

