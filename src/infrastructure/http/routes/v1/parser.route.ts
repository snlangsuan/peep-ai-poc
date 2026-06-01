import { Hono } from 'hono'

import { ParserController } from '#/features/parser/v1/parser.controller'
import { classifyDoc } from '#/features/parser/v1/parser.openapi'
import { parserPayloadSchema } from '#/features/parser/v1/parser.schema'
import { ParserService } from '#/features/parser/v1/parser.service'
import { UserRepository } from '#/features/users/v1/user.repository'
import { authMiddleware } from '#/infrastructure/http/middlewares/auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'

import type { Bindings, Variables } from '#/common/types/app.type'

const parserGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const userRepository = new UserRepository()
const service = new ParserService()
const controller = new ParserController(service)

parserGroup.use('*', authMiddleware(userRepository))

parserGroup.post('/', classifyDoc, zValidator('json', parserPayloadSchema), controller.classify)

export default parserGroup
