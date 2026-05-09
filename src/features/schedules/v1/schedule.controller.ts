import type { Bindings, JsonInputSchema, ParamInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { ScheduleService } from '#/features/schedules/v1/schedule.service'
import type {
  TCreateSchedule,
  TScheduleIdParam,
  TScheduleListFilter,
  TScheduleListResponse,
  TScheduleResponse,
  TUpdateSchedule,
} from '#/features/schedules/v1/schedule.type'
import type { Context } from 'hono'

import {
  scheduleListResponseSchema,
  scheduleResponseSchema,
} from '#/features/schedules/v1/schedule.schema'

export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  create = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TCreateSchedule>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const data = c.req.valid('json')

    const result = await this.scheduleService.create(apiKey as string, data)

    return c.json<TScheduleResponse>(scheduleResponseSchema.parse(result), 201)
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TScheduleListFilter>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const filter = c.req.valid('query')

    const result = await this.scheduleService.list(apiKey as string, filter)

    return c.json<TScheduleListResponse>(scheduleListResponseSchema.parse(result))
  }

  get = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TScheduleIdParam>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { id } = c.req.valid('param')

    const result = await this.scheduleService.get(apiKey as string, id)
    if (!result) return c.json({ error: 'Schedule not found' }, 404)

    return c.json<TScheduleResponse>(scheduleResponseSchema.parse(result))
  }

  update = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TScheduleIdParam> & JsonInputSchema<TUpdateSchedule>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { id } = c.req.valid('param')
    const data = c.req.valid('json')

    const result = await this.scheduleService.update(apiKey as string, id, data)
    if (!result) return c.json({ error: 'Schedule not found' }, 404)

    return c.json<TScheduleResponse>(scheduleResponseSchema.parse(result))
  }

  delete = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TScheduleIdParam>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const apiKey = c.req.header('x-api-key')
    const { id } = c.req.valid('param')

    const success = await this.scheduleService.delete(apiKey as string, id)
    if (!success) return c.json({ error: 'Schedule not found' }, 404)

    return c.json({ success: true })
  }
}
