import { Hono } from 'hono'

import { authMiddleware } from '#/infrastructure/http/middlewares/auth.middleware'
import { zValidator } from '#/infrastructure/http/middlewares/validator.middleware'
import { HoroscopeController } from '#/features/horoscopes/v1/horoscope.controller'
import { listDoc } from '#/features/horoscopes/v1/horoscope.openapi'
import { HoroscopeRepository } from '#/features/horoscopes/v1/horoscope.repository'
import { horoscopeFilterPayloadSchema } from '#/features/horoscopes/v1/horoscope.schema'
import { HoroscopeService } from '#/features/horoscopes/v1/horoscope.service'

import type { Bindings, Variables } from '#/common/types/app.type'

const horoscopesGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const repository = new HoroscopeRepository()
const service = new HoroscopeService(repository)
const controller = new HoroscopeController(service)

horoscopesGroup.use('*', authMiddleware())

horoscopesGroup.get('/', listDoc, zValidator('query', horoscopeFilterPayloadSchema), controller.list)

export default horoscopesGroup
