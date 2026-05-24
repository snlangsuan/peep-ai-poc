import { Hono } from 'hono'

import { authMiddleware } from '#/core/middlewares/auth.middleware'
import { zValidator } from '#/core/middlewares/validator.middleware'
import { UserController } from '#/features/users/v1/user.controller'
import { createDoc, getInfoDoc, loginDoc } from '#/features/users/v1/user.openapi'
import { UserRepository } from '#/features/users/v1/user.repository'
import { userCreatePayloadSchema, userLoginPayloadSchema } from '#/features/users/v1/user.schema'
import { UserService } from '#/features/users/v1/user.service'

import type { Bindings, Variables } from '#/common/types/app.type'

const usersGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const repository = new UserRepository()
const service = new UserService(repository)
const controller = new UserController(service)

usersGroup.post('/create', createDoc, zValidator('json', userCreatePayloadSchema), controller.create)

usersGroup.post('/login', loginDoc, zValidator('json', userLoginPayloadSchema), controller.login)

usersGroup.get('/me', getInfoDoc, authMiddleware(repository), controller.getInfo)

usersGroup.post('/credits', authMiddleware(repository), controller.addCredits)

export default usersGroup
