import { healthResponseSchema } from '#/features/health/v1/health.schema'

import type { Bindings, Variables } from '#/common/types/app.type'
import type { THealthResponse } from '#/features/health/v1/health.type'
import type { Context } from 'hono'
import type { HealthService } from '~/src/features/health/shared/health.service'

export class HealthController {
  constructor(private readonly healthService: HealthService) {}
  getHealth = async <E extends { Bindings: Bindings; Variables: Variables }, P extends string>(c: Context<E, P>) => {
    const info = await this.healthService.check()
    return c.json<THealthResponse>(healthResponseSchema.parse(info))
  }
}
