import {
  imageCodeListResponseSchema,
  imageCodeResponseSchema,
  imageInviteResponseSchema,
} from '#/features/image-invites/v1/image-invite.schema'

import type { Bindings, JsonInputSchema, QueryInputSchema, Variables } from '#/common/types/app.type'
import type { ImageInviteService } from '#/features/image-invites/v1/image-invite.service'
import type {
  TImageCodeCreatePayload,
  TImageCodeFilterPayload,
  TImageCodeListResponse,
  TImageCodeResponse,
  TImageInviteCreatePayload,
  TImageInviteResponse,
} from '#/features/image-invites/v1/image-invite.type'
import type { Context } from 'hono'

export class ImageInviteController {
  private service: ImageInviteService

  constructor(service: ImageInviteService) {
    this.service = service
  }

  generateCode = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TImageCodeCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const userId = c.get('user_id')
    const body = c.req.valid('json')
    const result = await this.service.generateCode(userId, body)
    return c.json<TImageCodeResponse>(imageCodeResponseSchema.parse(result))
  }

  listCodes = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends QueryInputSchema<TImageCodeFilterPayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const query = c.req.valid('query')
    const result = await this.service.listCodes(query)
    return c.json<TImageCodeListResponse>(imageCodeListResponseSchema.parse(result))
  }

  invite = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TImageInviteCreatePayload>,
  >(
    c: Context<E, P, I>,
  ): Promise<Response> => {
    const body = c.req.valid('json')
    const result = await this.service.invite(body)
    return c.json<TImageInviteResponse>(imageInviteResponseSchema.parse(result))
  }
}
