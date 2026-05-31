import { Hono } from 'hono'

import { authMiddleware } from '#/infrastructure/http/middlewares/auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'
import { MoodController } from '#/features/moods/v1/mood.controller'
import { createDoc, listDoc } from '#/features/moods/v1/mood.openapi'
import { MoodRepository } from '#/features/moods/v1/mood.repository'
import {
  moodCreatePayloadSchema,
  moodFilterPayloadSchema,
} from '#/features/moods/v1/mood.schema'
import { MoodService } from '#/features/moods/v1/mood.service'
import { UserRepository } from '#/features/users/v1/user.repository'

import type { Bindings, Variables } from '#/common/types/app.type'

const moodsGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const userRepository = new UserRepository()
const repository = new MoodRepository()
const service = new MoodService(repository)
const controller = new MoodController(service)

moodsGroup.use('*', authMiddleware(userRepository))

moodsGroup.post('/', createDoc, zValidator('json', moodCreatePayloadSchema), controller.create)
moodsGroup.get('/', listDoc, zValidator('query', moodFilterPayloadSchema), controller.list)

export default moodsGroup
