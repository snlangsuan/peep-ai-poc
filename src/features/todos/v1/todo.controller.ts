import { z } from 'zod'

import { successResponseSchema } from '#/common/schemas/response.schema'
import { todoResponseSchema, todoItemResponseSchema } from '#/features/todos/v1/todo.schema'

import type { Bindings, JsonInputSchema, ParamInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { TSuccessResponse } from '#/common/types/response.type'
import type { TodoService } from '#/features/todos/v1/todo.service'
import type {
  TTodoResponse,
  TTodoCreatePayload,
  TTodoUpdatePayload,
  TTodoFilterPayload,
  TTodoItemResponse,
  TTodoParamPayload,
} from '#/features/todos/v1/todo.type'
import type { Context } from 'hono'

export class TodoController {
  private service: TodoService

  constructor(service: TodoService) {
    this.service = service
  }

  create = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TTodoCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')
    const result = await this.service.create(userId, body)
    return c.json<TTodoResponse>(todoResponseSchema.parse(result))
  }

  get = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TTodoParamPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    const result = await this.service.getTodo(userId, id)
    return c.json<TTodoResponse>(todoResponseSchema.parse(result))
  }

  list = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TTodoFilterPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const query = c.req.valid('query')
    const result = await this.service.getTodos(userId, query)
    return c.json<TTodoItemResponse>(todoItemResponseSchema.parse(result))
  }

  update = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TTodoParamPayload> & JsonInputSchema<TTodoUpdatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    const body = c.req.valid('json')
    await this.service.update(userId, id, body)
    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
  }

  delete = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends ParamInputSchema<TTodoParamPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const { id } = c.req.valid('param')
    await this.service.delete(userId, id)
    return c.json<TSuccessResponse>(successResponseSchema.parse({}))
  }
}
