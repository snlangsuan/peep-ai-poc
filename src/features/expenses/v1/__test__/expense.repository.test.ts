import { describe, expect, it, mock, beforeEach } from 'bun:test'

import type admin from 'firebase-admin'

const mockSet = mock(async (): Promise<void> => {})
const mockGet = mock(async (): Promise<any> => {
  return {
    exists: false,
    data: () => null,
  }
})
const mockUpdate = mock(async (): Promise<void> => {})
const mockDelete = mock(async (): Promise<void> => {})

const mockDoc = mock((): any => {
  return {
    set: mockSet,
    get: mockGet,
    update: mockUpdate,
    delete: mockDelete,
  }
})

const mockQueryGet = mock(async (): Promise<any> => {
  return {
    size: 0,
    docs: [],
  }
})

const mockQuery: any = {
  where: mock(() => mockQuery),
  orderBy: mock(() => mockQuery),
  offset: mock(() => mockQuery),
  limit: mock(() => mockQuery),
  get: mockQueryGet,
}

mockQuery.where.mockImplementation(() => mockQuery)
mockQuery.orderBy.mockImplementation(() => mockQuery)
mockQuery.offset.mockImplementation(() => mockQuery)
mockQuery.limit.mockImplementation(() => mockQuery)

const mockDb = {
  collection: mock((): any => {
    return {
      doc: mockDoc,
      where: mockQuery.where,
      orderBy: mockQuery.orderBy,
      offset: mockQuery.offset,
      limit: mockQuery.limit,
      get: mockQuery.get,
    }
  }),
}

mock.module('#/common/libs/firebase.lib', () => {
  return {
    db: mockDb,
  }
})

import { ExpenseRepository } from '#/features/expenses/v1/expense.repository'

import type { IExpenseEntity } from '#/features/expenses/v1/expense.type'

describe('ExpenseRepository Unit Tests', () => {
  let repository: ExpenseRepository

  beforeEach(() => {
    repository = new ExpenseRepository()
    mockSet.mockClear()
    mockGet.mockClear()
    mockUpdate.mockClear()
    mockDelete.mockClear()
    mockDoc.mockClear()
    mockQueryGet.mockClear()
    mockQuery.where.mockClear()
    mockQuery.orderBy.mockClear()
    mockQuery.offset.mockClear()
    mockQuery.limit.mockClear()
    mockDb.collection.mockClear()
  })

  it('should write document to Firestore using snake_case fields on create', async (): Promise<void> => {
    mockQueryGet.mockImplementation(async (): Promise<any> => {
      return {
        empty: true,
        docs: [],
      }
    })

    const input: IExpenseEntity = {
      uuid: 'expense-uuid-1',
      created_by: 'user-uuid-1',
      subject: 'Office Supplies',
      amount: 1500,
      category: 'other',
      currency: 'THB',
      location: 'Store A',
      date: '2026-05-23',
      time: '14:30:00',
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    const result = await repository.create(input)

    expect(mockDb.collection).toHaveBeenCalledWith('expenses')
    expect(mockDoc).toHaveBeenCalledWith('expense-uuid-1')
    expect(mockSet).toHaveBeenCalledWith({
      uuid: 'expense-uuid-1',
      created_by: 'user-uuid-1',
      subject: 'Office Supplies',
      amount: 1500,
      category: 'other',
      currency: 'THB',
      location: 'Store A',
      date: '2026-05-23',
      time: '14:30:00',
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    })
    expect(result).toEqual(input)
  })

  it('should return existing document and not write if findDuplicate finds a duplicate', async (): Promise<void> => {
    const existingDoc: admin.firestore.DocumentData = {
      uuid: 'existing-uuid',
      created_by: 'user-uuid-1',
      subject: 'Office Supplies',
      amount: 1500,
      category: 'other',
      currency: 'THB',
      location: 'Store A',
      date: '2026-05-23',
      time: '14:30:00',
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    mockQueryGet.mockImplementation(async (): Promise<any> => {
      return {
        empty: false,
        docs: [
          {
            data: (): admin.firestore.DocumentData => existingDoc,
          },
        ],
      }
    })

    const input: IExpenseEntity = {
      uuid: 'expense-uuid-1',
      created_by: 'user-uuid-1',
      subject: 'Office Supplies',
      amount: 1500,
      category: 'other',
      currency: 'THB',
      location: 'Store A',
      date: '2026-05-23',
      time: '14:30:00',
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    const result = await repository.create(input)

    expect(mockSet).not.toHaveBeenCalled()
    expect(result.uuid).toBe('existing-uuid')
  })

  it('should find document by ID', async (): Promise<void> => {
    const fakeDoc: admin.firestore.DocumentData = {
      uuid: 'expense-uuid-1',
      created_by: 'user-uuid-1',
      subject: 'Office Supplies',
      amount: 1500,
      category: 'Other',
      currency: 'THB',
      location: 'Store A',
      date: '2026-05-23',
      time: '14:30:00',
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    mockGet.mockImplementation(async (): Promise<any> => {
      return {
        exists: true,
        data: (): admin.firestore.DocumentData => fakeDoc,
      }
    })

    const result = await repository.findById('expense-uuid-1')

    expect(mockDoc).toHaveBeenCalledWith('expense-uuid-1')
    expect(result).not.toBeNull()
    expect(result?.uuid).toBe('expense-uuid-1')
  })

  it('should return null when document is not found by ID', async (): Promise<void> => {
    mockGet.mockImplementation(async (): Promise<any> => {
      return {
        exists: false,
        data: () => null,
      }
    })

    const result = await repository.findById('non-existent')
    expect(result).toBeNull()
  })

  it('should query lists with pagination and date filters', async (): Promise<void> => {
    const fakeDoc: admin.firestore.DocumentData = {
      uuid: 'expense-uuid-1',
      created_by: 'user-uuid-1',
      subject: 'Office Supplies',
      amount: 1500,
      category: 'Other',
      currency: 'THB',
      location: 'Store A',
      date: '2026-05-23',
      time: '14:30:00',
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    mockQueryGet.mockImplementation(async (): Promise<any> => {
      return {
        size: 1,
        docs: [
          {
            data: (): admin.firestore.DocumentData => fakeDoc,
          },
        ],
      }
    })

    const result = await repository.list('user-uuid-1', {
      page: 1,
      limit: 10,
      sort: 'date',
      desc: true,
      start_date: '2026-05-01',
      end_date: '2026-05-31',
    })

    expect(mockQuery.where).toHaveBeenCalledWith('created_by', '==', 'user-uuid-1')
    expect(result.data.length).toBe(1)
    expect(result.total).toBe(1)
  })

  it('should update expense document fields', async (): Promise<void> => {
    const fields = {
      subject: 'New Subject',
      amount: 2000,
      category: 'other' as const,
      updated_at: '2026-05-23T01:00:00.000Z',
    }

    await repository.update('expense-uuid-1', fields)

    expect(mockDoc).toHaveBeenCalledWith('expense-uuid-1')
    expect(mockUpdate).toHaveBeenCalledWith({
      subject: 'New Subject',
      amount: 2000,
      category: 'other',
      updated_at: '2026-05-23T01:00:00.000Z',
    })
  })

  it('should delete expense document', async (): Promise<void> => {
    await repository.delete('expense-uuid-1')

    expect(mockDoc).toHaveBeenCalledWith('expense-uuid-1')
    expect(mockDelete).toHaveBeenCalled()
  })
})
