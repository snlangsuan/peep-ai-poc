import { z } from 'zod'

import { successResponseSchema } from '#/common/schemas/response.schema'
import { pushBotScheduleCreatedMessage } from '#/features/chats/v1/schedule-notify.helper'
import { scheduleResponseSchema, scheduleItemResponseSchema } from '#/features/schedules/v1/schedule.schema'

import type { Bindings, JsonInputSchema, ParamInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { TSuccessResponse } from '#/common/types/response.type'
import type { ScheduleService } from '#/features/schedules/v1/schedule.service'
import type {
  TScheduleResponse,
  TScheduleCreatePayload,
  TScheduleUpdatePayload,
  TScheduleFilterPayload,
  TScheduleItemResponse,
  TScheduleParamPayload,
} from '#/features/schedules/v1/schedule.type'
import type { Context } from 'hono'

export class ScheduleController {
  private service: ScheduleService

  constructor(service: ScheduleService) {
    this.service = service
  }

  create = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TScheduleCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')
    const result = await this.service.create(userId, body)

    void pushBotScheduleCreatedMessage(userId, [result])

    return c.json<TScheduleResponse>(scheduleResponseSchema.parse(result))
  }

  get = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TScheduleParamPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    const result = await this.service.getSchedule(userId, id)
    return c.json<TScheduleResponse>(scheduleResponseSchema.parse(result))
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TScheduleFilterPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const query = c.req.valid('query')
    const result = await this.service.getSchedules(userId, query)
    return c.json<TScheduleItemResponse>(scheduleItemResponseSchema.parse(result))
  }

  update = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TScheduleParamPayload> & JsonInputSchema<TScheduleUpdatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    const updated = await this.service.update(userId, id, body)

    void pushBotScheduleCreatedMessage(userId, [updated])

    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
  }

  delete = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TScheduleParamPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    await this.service.delete(userId, id)
    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
  }
}
