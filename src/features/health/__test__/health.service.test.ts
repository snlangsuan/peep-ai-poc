import { describe, expect, it, spyOn } from 'bun:test'
import dayjs from 'dayjs'

import * as datetimeUtil from '#/common/utils/datetime.util'
import { HealthService } from '#/features/health/shared/health.service'

describe('HealthService', () => {
  const healthService = new HealthService()

  it('should return health status with uptime and timestamp', async () => {
    // Mock process.uptime
    const uptimeSpy = spyOn(process, 'uptime').mockReturnValue(123.456)

    // Mock getLocalTime
    const mockDate = dayjs('2024-01-01T00:00:00Z')
    const getLocalTimeSpy = spyOn(datetimeUtil, 'getLocalTime').mockReturnValue(mockDate)

    const result = await healthService.check()

    expect(result).toEqual({
      status: 'ok',
      data: {
        uptime: 123.456,
        timestamp: mockDate.toISOString(),
      },
    })

    expect(uptimeSpy).toHaveBeenCalled()
    expect(getLocalTimeSpy).toHaveBeenCalled()

    // Restore mocks
    uptimeSpy.mockRestore()
    getLocalTimeSpy.mockRestore()
  })
})
