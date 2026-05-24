import { describe, expect, it, mock, beforeEach } from 'bun:test'

import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import ObjectNotFoundException from '#/common/exceptions/object.not.found.exception'
import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import { ScheduleService } from '#/features/schedules/v1/schedule.service'

describe('ScheduleService Unit Tests', () => {
  let mockSchedulesDb: Record<string, any>
  let mockScheduleRepository: ScheduleRepository
  let service: ScheduleService

  beforeEach(() => {
    mockSchedulesDb = {
      'schedule-1': {
        uuid: 'schedule-1',
        userId: 'user-uuid-1',
        title: 'Meeting with Bob',
        description: 'Discuss the project details.',
        location: 'Office',
        scheduled_at: '2026-05-23T10:00:00Z',
        before_sent_at: null,
        sent_at: null,
        payload: {
          message: 'Meeting with Bob',
          type: 'user_schedule',
          title: 'Meeting with Bob',
          description: 'Discuss the project details.',
          location: 'Office',
        },
        createdAt: '2026-05-22T08:00:00Z',
        updatedAt: '2026-05-22T08:00:00Z',
      },
    }

    mockScheduleRepository = {
      create: mock(async (input: any): Promise<void> => {
        mockSchedulesDb[input.uuid] = input
        return Promise.resolve()
      }),
      findById: mock(async (uuid: string): Promise<any | null> => {
        return mockSchedulesDb[uuid] || null
      }),
      findByUserId: mock(async (userId: string, filter?: any): Promise<{ data: any[]; total: number }> => {
        const data = Object.values(mockSchedulesDb).filter((s) => s.userId === userId)
        return { data, total: data.length }
      }),
      update: mock(async (uuid: string, fields: any): Promise<void> => {
        if (mockSchedulesDb[uuid]) {
          mockSchedulesDb[uuid] = { ...mockSchedulesDb[uuid], ...fields }
        }
        return Promise.resolve()
      }),
      delete: mock(async (uuid: string): Promise<void> => {
        delete mockSchedulesDb[uuid]
        return Promise.resolve()
      }),
    } as unknown as ScheduleRepository

    service = new ScheduleService(mockScheduleRepository)
  })

  it('should create schedule successfully', async (): Promise<void> => {
    const result = await service.create('user-uuid-1', {
      title: 'Lunch with Alice',
      description: 'Discuss marketing strategy',
      location: 'Cafe',
      scheduled_at: '2026-05-24T12:00:00.000Z',
    })

    expect(result.uuid).toBeDefined()
    expect(result.userId).toBe('user-uuid-1')
    expect(result.scheduled_at).toBe('2026-05-24T12:00:00.000Z')
    expect(result.payload.message).toBe('Lunch with Alice')
    expect(result.payload.type).toBe('user_schedule')
    expect(result.payload.title).toBe('Lunch with Alice')
    expect(result.payload.description).toBe('Discuss marketing strategy')
    expect(result.payload.location).toBe('Cafe')
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
    expect(mockScheduleRepository.create).toHaveBeenCalled()
  })

  it('should retrieve single schedule belonging to user', async (): Promise<void> => {
    const result = await service.getSchedule('user-uuid-1', 'schedule-1')

    expect(result.uuid).toBe('schedule-1')
    expect(result.scheduled_at).toBe('2026-05-23T10:00:00Z')
    expect(result.payload.message).toBe('Meeting with Bob')
    expect(result.payload.type).toBe('user_schedule')
    expect(result.payload.title).toBe('Meeting with Bob')
    expect(result.payload.description).toBe('Discuss the project details.')
    expect(result.payload.location).toBe('Office')
  })

  it('should throw ObjectNotFoundException when retrieving missing schedule', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.getSchedule('user-uuid-1', 'missing-schedule')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when user is not owner', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.getSchedule('user-uuid-2', 'schedule-1')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })

  it('should retrieve user schedule list', async (): Promise<void> => {
    const result = await service.getSchedules('user-uuid-1')

    expect(result.items.length).toBe(1)
    expect(result.items[0]?.uuid).toBe('schedule-1')
    expect(result.items[0]?.scheduled_at).toBe('2026-05-23T10:00:00Z')
    expect(result.metadata.total).toBe(1)
  })

  it('should propagate date filters when retrieving user schedule list', async (): Promise<void> => {
    const filter = { start_date: '2026-05-23 10:00', end_date: '2026-05-24 12:00' }
    const result = await service.getSchedules('user-uuid-1', filter)

    expect(result.items.length).toBe(1)
    expect(mockScheduleRepository.findByUserId).toHaveBeenCalledWith('user-uuid-1', filter)
  })

  it('should update schedule successfully', async (): Promise<void> => {
    const result = await service.update('user-uuid-1', 'schedule-1', {
      title: 'Meeting with Bob (Updated)',
      location: 'Conference Room',
    })

    expect(result.uuid).toBe('schedule-1')
    expect(result.payload.message).toBe('Meeting with Bob (Updated)')
    expect(result.payload.title).toBe('Meeting with Bob (Updated)')
    expect(result.payload.location).toBe('Conference Room')
    expect(result.payload.description).toBe('Discuss the project details.')
  })

  it('should reset before_sent_at and sent_at to null if scheduled_at is updated to a future date', async (): Promise<void> => {
    mockSchedulesDb['schedule-1'].before_sent_at = '2026-05-23T09:00:00Z'
    mockSchedulesDb['schedule-1'].sent_at = '2026-05-23T09:30:00Z'

    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const result = await service.update('user-uuid-1', 'schedule-1', {
      scheduled_at: futureDate,
    })

    expect(result.scheduled_at).toBe(futureDate)
    expect(result.before_sent_at).toBeNull()
    expect(result.sent_at).toBeNull()
  })

  it('should throw ObjectNotFoundException when updating missing schedule', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.update('user-uuid-1', 'missing-schedule', {
        title: 'New Title',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when updating schedule of another user', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.update('user-uuid-2', 'schedule-1', {
        title: 'Stolen Title',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })

  it('should delete schedule successfully', async (): Promise<void> => {
    await service.delete('user-uuid-1', 'schedule-1')
    expect(mockSchedulesDb['schedule-1']).toBeUndefined()
  })

  it('should throw ObjectNotFoundException when deleting missing schedule', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.delete('user-uuid-1', 'missing-schedule')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when deleting schedule of another user', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.delete('user-uuid-2', 'schedule-1')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })
})
