import { Hono } from 'hono'

import { zValidator } from '#/core/middlewares/validator.middleware'
import { MessageController } from '#/features/messages/v1/message.controller'
import { extractMessageDoc } from '#/features/messages/v1/message.openapi'
import { extractMessageRequestBodyPayloadSchema } from '#/features/messages/v1/message.schema'
import { MessageService } from '#/features/messages/v1/message.service'
import { AIService } from '#/common/services/ai.service'

const aiService = new AIService()
const messageService = new MessageService(aiService)
const messageController = new MessageController(messageService)

const messageRoute = new Hono()

messageRoute.post(
  '/extract',
  extractMessageDoc,
  zValidator('json', extractMessageRequestBodyPayloadSchema),
  messageController.extract,
)

export default messageRoute
