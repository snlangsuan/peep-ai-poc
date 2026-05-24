import { describe, expect, it, mock, beforeEach } from 'bun:test'

import type admin from 'firebase-admin'

const mockSet = mock(async (data: any): Promise<void> => {})
const mockGet = mock(async (): Promise<any> => {
  return {
    exists: false,
    data: () => null,
  }
})
const mockUpdate = mock(async (data: any): Promise<void> => {})
const mockDelete = mock(async (): Promise<void> => {})

const mockDoc = mock((id: string): any => {
  return {
    set: mockSet,
    get: mockGet,
    update: mockUpdate,
    delete: mockDelete,
  }
})

const mockWhereGet = mock(async (): Promise<any> => {
  return {
    docs: [],
  }
})

const mockChainedWhere = mock((): any => {})
const mockWhere = mock((field: string, op: string, val: any): any => {
  const q = {
    get: mockWhereGet,
    where: mockChainedWhere,
  }
  mockChainedWhere.mockImplementation(() => q)
  return q
})

const mockDb = {
  collection: mock((name: string): any => {
    return {
      doc: mockDoc,
      where: mockWhere,
    }
  }),
}

mock.module('#/common/libs/firebase.lib', () => {
  return {
    db: mockDb,
  }
})

import { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'

import type { TScheduleCreateInput } from '#/features/schedules/v1/schedule.type'

describe('ScheduleRepository Unit Tests', () => {
  let repository: ScheduleRepository

  beforeEach(() => {
    repository = new ScheduleRepository()
    mockSet.mockClear()
    mockGet.mockClear()
    mockUpdate.mockClear()
    mockDelete.mockClear()
    mockDoc.mockClear()
    mockWhereGet.mockClear()
    mockWhere.mockClear()
    mockChainedWhere.mockClear()
    mockDb.collection.mockClear()
  })

  it('should write document to Firestore using snake_case field names on create', async (): Promise<void> => {
    const input: TScheduleCreateInput = {
      uuid: 'schedule-uuid-1',
      user_id: 'user-uuid-1',
      scheduled_at: '2026-06-01T09:00:00.000Z',
      before_sent_at: null,
      sent_at: null,
      payload: {
        message: 'Sync Sync',
        type: 'user_schedule',
        title: 'Sync Sync',
        description: 'Meeting description',
        location: 'Zoom',
      },
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    await repository.create(input)

    expect(mockDb.collection).toHaveBeenCalledWith('schedules')
    expect(mockDoc).toHaveBeenCalledWith('schedule-uuid-1')
    expect(mockSet).toHaveBeenCalledWith({
      uuid: 'schedule-uuid-1',
      user_id: 'user-uuid-1',
      scheduled_at: new Date('2026-06-01T09:00:00.000Z'),
      before_sent_at: null,
      sent_at: null,
      payload: {
        message: 'Sync Sync',
        type: 'user_schedule',
        title: 'Sync Sync',
        description: 'Meeting description',
        location: 'Zoom',
      },
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    })
  })

  it('should map snake_case fields correctly to camelCase when finding document by id', async (): Promise<void> => {
    const fakeDbDoc: admin.firestore.DocumentData = {
      uuid: 'schedule-uuid-1',
      user_id: 'user-uuid-1',
      scheduled_at: {
        toDate: (): Date => new Date('2026-06-01T09:00:00.000Z'),
      },
      before_sent_at: null,
      sent_at: null,
      payload: {
        message: 'Sync Sync',
        type: 'user_schedule',
        title: 'Sync Sync',
        description: 'Meeting description',
        location: 'Zoom',
      },
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    mockGet.mockImplementation(async (): Promise<any> => {
      return {
        exists: true,
        data: (): admin.firestore.DocumentData => fakeDbDoc,
      }
    })

    const result = await repository.findById('schedule-uuid-1')

    expect(mockDb.collection).toHaveBeenCalledWith('schedules')
    expect(mockDoc).toHaveBeenCalledWith('schedule-uuid-1')
    expect(mockGet).toHaveBeenCalled()

    expect(result).not.toBeNull()
    if (result) {
      expect(result.uuid).toBe('schedule-uuid-1')
      expect(result.userId).toBe('user-uuid-1')
      expect(result.scheduled_at).toBe('2026-06-01T09:00:00.000Z')
      expect(result.createdAt).toBe('2026-05-23T00:00:00.000Z')
      expect(result.updatedAt).toBe('2026-05-23T00:00:00.000Z')
    }
  })

  it('should query Firestore using snake_case user_id key when finding by user id', async (): Promise<void> => {
    const fakeDbDoc: admin.firestore.DocumentData = {
      uuid: 'schedule-uuid-1',
      user_id: 'user-uuid-1',
      scheduled_at: {
        toDate: (): Date => new Date('2026-06-01T09:00:00.000Z'),
      },
      before_sent_at: null,
      sent_at: null,
      payload: {
        message: 'Sync Sync',
        type: 'user_schedule',
        title: 'Sync Sync',
      },
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    mockWhereGet.mockImplementation(async (): Promise<any> => {
      return {
        docs: [
          {
            data: (): admin.firestore.DocumentData => fakeDbDoc,
          },
        ],
      }
    })

    const results = await repository.findByUserId('user-uuid-1')

    expect(mockDb.collection).toHaveBeenCalledWith('schedules')
    expect(mockWhere).toHaveBeenCalledWith('user_id', '==', 'user-uuid-1')
    expect(mockWhereGet).toHaveBeenCalled()

    expect(results.data.length).toBe(1)
    expect(results.data[0]?.createdAt).toBe('2026-05-23T00:00:00.000Z')
    expect(results.data[0]?.updatedAt).toBe('2026-05-23T00:00:00.000Z')
  })

  it('should query Firestore with date filters when finding by user id', async (): Promise<void> => {
    const fakeDbDoc: admin.firestore.DocumentData = {
      uuid: 'schedule-uuid-1',
      user_id: 'user-uuid-1',
      scheduled_at: {
        toDate: (): Date => new Date('2026-06-01T09:00:00.000Z'),
      },
      before_sent_at: null,
      sent_at: null,
      payload: {
        message: 'Sync Sync',
        type: 'user_schedule',
        title: 'Sync Sync',
      },
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    mockWhereGet.mockImplementation(async (): Promise<any> => {
      return {
        docs: [
          {
            data: (): admin.firestore.DocumentData => fakeDbDoc,
          },
        ],
      }
    })

    const results = await repository.findByUserId('user-uuid-1', {
      start_date: '2026-06-01 00:00',
      end_date: '2026-06-02 23:59',
    })

    expect(mockDb.collection).toHaveBeenCalledWith('schedules')
    expect(mockWhere).toHaveBeenCalledWith('user_id', '==', 'user-uuid-1')
    expect(mockWhereGet).toHaveBeenCalled()

    expect(results.data.length).toBe(1)
  })

  it('should query Firestore with start_date and end_date datetime range filters when finding by user id', async (): Promise<void> => {
    const fakeDbDoc1: admin.firestore.DocumentData = {
      uuid: 'schedule-uuid-1',
      user_id: 'user-uuid-1',
      scheduled_at: {
        toDate: (): Date => new Date('2026-06-01T02:00:00.000Z'),
      },
      payload: {
        message: 'Sync 1',
        type: 'user_schedule',
        title: 'Sync 1',
      },
    }
    const fakeDbDoc2: admin.firestore.DocumentData = {
      uuid: 'schedule-uuid-2',
      user_id: 'user-uuid-1',
      scheduled_at: {
        toDate: (): Date => new Date('2026-06-01T04:00:00.000Z'),
      },
      payload: {
        message: 'Sync 2',
        type: 'user_schedule',
        title: 'Sync 2',
      },
    }

    mockWhereGet.mockImplementation(async (): Promise<any> => {
      return {
        docs: [
          { data: (): admin.firestore.DocumentData => fakeDbDoc1 },
          { data: (): admin.firestore.DocumentData => fakeDbDoc2 },
        ],
      }
    })

    const results = await repository.findByUserId('user-uuid-1', {
      start_date: '2026-06-01 08:00',
      end_date: '2026-06-01 10:00',
    })

    expect(results.data.length).toBe(1)
    expect(results.data[0]?.uuid).toBe('schedule-uuid-1')
  })

  it('should write to snake_case fields during update operations', async (): Promise<void> => {
    const fields: Partial<TScheduleCreateInput> = {
      scheduled_at: '2026-06-02T10:00:00.000Z',
      updated_at: '2026-05-23T01:00:00.000Z',
    }

    await repository.update('schedule-uuid-1', fields)

    expect(mockDb.collection).toHaveBeenCalledWith('schedules')
    expect(mockDoc).toHaveBeenCalledWith('schedule-uuid-1')
    expect(mockUpdate).toHaveBeenCalledWith({
      scheduled_at: new Date('2026-06-02T10:00:00.000Z'),
      updated_at: '2026-05-23T01:00:00.000Z',
    })
  })

  it('should call Firestore delete method on doc reference', async (): Promise<void> => {
    await repository.delete('schedule-uuid-1')

    expect(mockDb.collection).toHaveBeenCalledWith('schedules')
    expect(mockDoc).toHaveBeenCalledWith('schedule-uuid-1')
    expect(mockDelete).toHaveBeenCalled()
  })
})
