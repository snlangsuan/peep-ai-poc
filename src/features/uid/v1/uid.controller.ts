import type { Bindings, JsonInputSchema, Variables } from '#/common/types/app.type'
import type { UidService } from '#/features/uid/v1/uid.service'
import type { TGenerateUid, TUidResponse } from '#/features/uid/v1/uid.type'
import type { Context } from 'hono'

import { uidResponseSchema } from '#/features/uid/v1/uid.schema'

export class UidController {
  constructor(private readonly uidService: UidService) {}

  generate = async <
    E extends { Bindings: Bindings; Variables: Variables },
    P extends string,
    I extends JsonInputSchema<TGenerateUid>,
  >(
    c: Context<E, P, I>,
  ) => {
    const { prefix, display_name } = c.req.valid('json')

    const { id, credits } = await this.uidService.generate(prefix, display_name)

    return c.json<TUidResponse>(uidResponseSchema.parse({ id, display_name, credits }))
  }

  getProfile = async <E extends { Bindings: Bindings; Variables: Variables }, P extends string>(c: Context<E, P>) => {
    const apiKey = c.req.header('x-api-key')
    const profile = await this.uidService.getProfile(apiKey as string)

    if (!profile) {
      return c.json({ message: 'Profile not found' }, 404)
    }

    return c.json<TUidResponse>(uidResponseSchema.parse(profile))
  }
}
