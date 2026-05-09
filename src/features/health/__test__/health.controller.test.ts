import { describe, expect, it, mock } from 'bun:test'

import { HealthController } from '#/features/health/v1/health.controller'

import type { HealthService } from '#/features/health/shared/health.service'
import type { Context } from 'hono'

describe('HealthController', () => {
  const mockHealthService = {
    check: mock(async () => ({
      status: 'ok',
      data: {
        uptime: 100,
        timestamp: '2024-01-01T00:00:00Z',
      },
    })),
  } as unknown as HealthService

  const controller = new HealthController(mockHealthService)

  it('should return health info as JSON', async () => {
    const mockContext = {
      json: mock((data: unknown) => data),
    } as unknown as Context

    await controller.getHealth(mockContext)

    expect(mockHealthService.check).toHaveBeenCalled()
    expect(mockContext.json).toHaveBeenCalledWith({
      status: 'ok',
      data: {
        uptime: 100,
        timestamp: '2024-01-01T00:00:00Z',
      },
    })
  })
})
