import { Hono } from 'hono'

import { authMiddleware } from '#/core/middlewares/auth.middleware'
import { zValidator } from '#/core/middlewares/validator.middleware'
import { UidRepository } from '#/features/uid/v1/uid.repository'
import { UidService } from '#/features/uid/v1/uid.service'
import { UidController } from '#/features/uid/v1/uid.controller'
import { generateUidDoc, getProfileDoc } from '#/features/uid/v1/uid.openapi'
import { generateUidSchema } from '#/features/uid/v1/uid.schema'

const uidRepository = new UidRepository()
const uidService = new UidService(uidRepository)
const uidController = new UidController(uidService)

const uidRoute = new Hono()

uidRoute.post('/', generateUidDoc, zValidator('json', generateUidSchema), uidController.generate)
uidRoute.get('/profile', authMiddleware(), getProfileDoc, uidController.getProfile)

export default uidRoute
