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

import { TodoRepository } from '#/features/todos/v1/todo.repository'

import type { ITodoCreateInput } from '#/features/todos/v1/todo.type'

describe('TodoRepository Unit Tests', () => {
  let repository: TodoRepository

  beforeEach(() => {
    repository = new TodoRepository()
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
    const input: ITodoCreateInput = {
      uuid: 'todo-uuid-1',
      user_id: 'user-uuid-1',
      title: 'Finish API Key Refactoring',
      description: 'Finish writing unit tests',
      completed: false,
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    await repository.create(input)

    expect(mockDb.collection).toHaveBeenCalledWith('todos')
    expect(mockDoc).toHaveBeenCalledWith('todo-uuid-1')
    expect(mockSet).toHaveBeenCalledWith({
      uuid: 'todo-uuid-1',
      user_id: 'user-uuid-1',
      title: 'Finish API Key Refactoring',
      description: 'Finish writing unit tests',
      completed: false,
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    })
  })

  it('should map snake_case fields correctly when finding document by id', async (): Promise<void> => {
    const fakeDbDoc: admin.firestore.DocumentData = {
      uuid: 'todo-uuid-1',
      user_id: 'user-uuid-1',
      title: 'Finish API Key Refactoring',
      description: 'Finish writing unit tests',
      completed: false,
      created_at: '2026-05-23T00:00:00.000Z',
      updated_at: '2026-05-23T00:00:00.000Z',
    }

    mockGet.mockImplementation(async (): Promise<any> => {
      return {
        exists: true,
        data: (): admin.firestore.DocumentData => fakeDbDoc,
      }
    })

    const result = await repository.findById('todo-uuid-1')

    expect(mockDb.collection).toHaveBeenCalledWith('todos')
    expect(mockDoc).toHaveBeenCalledWith('todo-uuid-1')
    expect(mockGet).toHaveBeenCalled()

    expect(result).not.toBeNull()
    if (result) {
      expect(result.uuid).toBe('todo-uuid-1')
      expect(result.user_id).toBe('user-uuid-1')
      expect(result.title).toBe('Finish API Key Refactoring')
      expect(result.description).toBe('Finish writing unit tests')
      expect(result.completed).toBe(false)
      expect(result.created_at).toBe('2026-05-23T00:00:00.000Z')
      expect(result.updated_at).toBe('2026-05-23T00:00:00.000Z')
    }
  })

  it('should query Firestore using snake_case user_id key when finding by user id', async (): Promise<void> => {
    const fakeDbDoc: admin.firestore.DocumentData = {
      uuid: 'todo-uuid-1',
      user_id: 'user-uuid-1',
      title: 'Finish API Key Refactoring',
      completed: true,
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

    expect(mockDb.collection).toHaveBeenCalledWith('todos')
    expect(mockWhere).toHaveBeenCalledWith('user_id', '==', 'user-uuid-1')
    expect(mockWhereGet).toHaveBeenCalled()

    expect(results.data.length).toBe(1)
    expect(results.data[0]?.uuid).toBe('todo-uuid-1')
    expect(results.data[0]?.user_id).toBe('user-uuid-1')
    expect(results.data[0]?.title).toBe('Finish API Key Refactoring')
    expect(results.data[0]?.completed).toBe(true)
    expect(results.data[0]?.created_at).toBe('2026-05-23T00:00:00.000Z')
    expect(results.data[0]?.updated_at).toBe('2026-05-23T00:00:00.000Z')
  })

  it('should write to snake_case fields during update operations', async (): Promise<void> => {
    const fields: Partial<ITodoCreateInput> = {
      title: 'Updated Title',
      completed: true,
      updated_at: '2026-05-23T01:00:00.000Z',
    }

    await repository.update('todo-uuid-1', fields)

    expect(mockDb.collection).toHaveBeenCalledWith('todos')
    expect(mockDoc).toHaveBeenCalledWith('todo-uuid-1')
    expect(mockUpdate).toHaveBeenCalledWith({
      title: 'Updated Title',
      completed: true,
      updated_at: '2026-05-23T01:00:00.000Z',
    })
  })

  it('should call Firestore delete method on doc reference', async (): Promise<void> => {
    await repository.delete('todo-uuid-1')

    expect(mockDb.collection).toHaveBeenCalledWith('todos')
    expect(mockDoc).toHaveBeenCalledWith('todo-uuid-1')
    expect(mockDelete).toHaveBeenCalled()
  })
})
