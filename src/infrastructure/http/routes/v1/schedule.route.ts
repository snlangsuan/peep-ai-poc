import { Hono } from 'hono'

import { zValidator } from '#/core/middlewares/validator.middleware'
import { ScheduleController } from '#/features/schedules/v1/schedule.controller'
import {
  createScheduleDoc,
  deleteScheduleDoc,
  getScheduleDoc,
  listScheduleDoc,
  updateScheduleDoc,
} from '#/features/schedules/v1/schedule.openapi'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import {
  createScheduleSchema,
  scheduleIdParamSchema,
  scheduleListFilterSchema,
  updateScheduleSchema,
} from '#/features/schedules/v1/schedule.schema'
import { ScheduleService } from '#/features/schedules/v1/schedule.service'
import { authMiddleware } from '#/core/middlewares/auth.middleware'

const scheduleRepository = new ScheduleRepository()
const scheduleService = new ScheduleService(scheduleRepository)
const scheduleController = new ScheduleController(scheduleService)

const scheduleRoute = new Hono()

scheduleRoute.use('*', authMiddleware())

scheduleRoute.post('/', createScheduleDoc, zValidator('json', createScheduleSchema), scheduleController.create)
scheduleRoute.get('/', listScheduleDoc, zValidator('query', scheduleListFilterSchema), scheduleController.list)
scheduleRoute.get('/:id', getScheduleDoc, zValidator('param', scheduleIdParamSchema), scheduleController.get)
scheduleRoute.patch(
  '/:id',
  updateScheduleDoc,
  zValidator('param', scheduleIdParamSchema),
  zValidator('json', updateScheduleSchema),
  scheduleController.update,
)
scheduleRoute.delete('/:id', deleteScheduleDoc, zValidator('param', scheduleIdParamSchema), scheduleController.delete)

export default scheduleRoute
