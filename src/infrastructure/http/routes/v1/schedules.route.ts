import { Hono } from 'hono'

import { authMiddleware } from '#/core/middlewares/auth.middleware'
import { zValidator } from '#/core/middlewares/validator.middleware'
import { ScheduleController } from '#/features/schedules/v1/schedule.controller'
import { createDoc, deleteDoc, getDoc, listDoc, updateDoc } from '#/features/schedules/v1/schedule.openapi'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import {
  scheduleCreatePayloadSchema,
  scheduleUpdatePayloadSchema,
  scheduleFilterPayloadSchema,
  scheduleParamPayloadSchema,
} from '#/features/schedules/v1/schedule.schema'
import { ScheduleService } from '#/features/schedules/v1/schedule.service'
import { UserRepository } from '#/features/users/v1/user.repository'

import type { Bindings, Variables } from '#/common/types/app.type'

const schedulesGroup = new Hono<{ Bindings: Bindings; Variables: Variables }>()

const userRepository = new UserRepository()
const repository = new ScheduleRepository()
const service = new ScheduleService(repository)
const controller = new ScheduleController(service)

schedulesGroup.use('*', authMiddleware(userRepository))

schedulesGroup.post('/', createDoc, zValidator('json', scheduleCreatePayloadSchema), controller.create)

schedulesGroup.get('/:id', getDoc, zValidator('param', scheduleParamPayloadSchema), controller.get)

schedulesGroup.get('/', listDoc, zValidator('query', scheduleFilterPayloadSchema), controller.list)

schedulesGroup.put(
  '/:id',
  updateDoc,
  zValidator('param', scheduleParamPayloadSchema),
  zValidator('json', scheduleUpdatePayloadSchema),
  controller.update,
)

schedulesGroup.delete('/:id', deleteDoc, zValidator('param', scheduleParamPayloadSchema), controller.delete)

export default schedulesGroup
