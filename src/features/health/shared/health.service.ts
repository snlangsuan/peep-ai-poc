import { getLocalTime } from '#/common/utils/datetime.util'

import type { THealthResponse } from '#/features/health/v1/health.type'

export class HealthService {
  async check(): Promise<THealthResponse> {
    const status: THealthResponse['data'] = {
      uptime: process.uptime(),
      timestamp: getLocalTime().toISOString(),
    }

    return {
      status: 'ok',
      data: status,
    }
  }
}
