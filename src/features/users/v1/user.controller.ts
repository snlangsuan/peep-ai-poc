import AuthenticationException from '#/common/exceptions/authentication.exception'
import { userResponseSchema, userLoginResponseSchema } from '#/features/users/v1/user.schema'

import type { Bindings, JsonInputSchema, Variables } from '#/common/types/app.type'
import type { UserService } from '#/features/users/v1/user.service'
import type {
  TUserResponse,
  TUserCreatePayload,
  TUserLoginPayload,
  TUserLoginResponse,
} from '#/features/users/v1/user.type'
import type { Context, Input } from 'hono'

export class UserController {
  private service: UserService

  constructor(service: UserService) {
    this.service = service
  }

  create = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TUserCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const body = c.req.valid('json')
    const result = await this.service.create(body)
    return c.json<TUserResponse>(userResponseSchema.parse(result))
  }

  login = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TUserLoginPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const body = c.req.valid('json')
    const result = await this.service.login(body)
    return c.json<TUserLoginResponse>(userLoginResponseSchema.parse(result))
  }

  getInfo = async <E extends { Bindings: Bindings; Variables: Variables }, P extends string, I extends Input>(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const result = await this.service.getUserInfoById(userId)
    return c.json<TUserResponse>(userResponseSchema.parse(result))
  }
}
