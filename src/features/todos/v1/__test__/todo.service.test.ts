import { describe, expect, it, mock, beforeEach } from 'bun:test'

import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import ObjectNotFoundException from '#/common/exceptions/object.not.found.exception'
import { TodoRepository } from '#/features/todos/v1/todo.repository'
import { TodoService } from '#/features/todos/v1/todo.service'

describe('TodoService Unit Tests', () => {
  let mockTodosDb: Record<string, any>
  let mockTodoRepository: TodoRepository
  let service: TodoService

  beforeEach(() => {
    mockTodosDb = {
      'todo-1': {
        uuid: 'todo-1',
        user_id: 'user-uuid-1',
        title: 'Finish API Key Refactoring',
        description: 'Finish writing unit tests',
        completed: false,
        created_at: '2026-05-22T08:00:00Z',
        updated_at: '2026-05-22T08:00:00Z',
      },
    }

    mockTodoRepository = {
      create: mock(async (input: any): Promise<void> => {
        mockTodosDb[input.uuid] = input
        return Promise.resolve()
      }),
      findById: mock(async (uuid: string): Promise<any | null> => {
        return mockTodosDb[uuid] || null
      }),
      findByUserId: mock(async (userId: string, filter?: any): Promise<{ data: any[]; total: number }> => {
        const data = Object.values(mockTodosDb).filter((t) => t.user_id === userId)
        return { data, total: data.length }
      }),
      update: mock(async (uuid: string, fields: any): Promise<void> => {
        if (mockTodosDb[uuid]) {
          mockTodosDb[uuid] = { ...mockTodosDb[uuid], ...fields }
        }
        return Promise.resolve()
      }),
      delete: mock(async (uuid: string): Promise<void> => {
        delete mockTodosDb[uuid]
        return Promise.resolve()
      }),
    } as unknown as TodoRepository

    service = new TodoService(mockTodoRepository)
  })

  it('should create todo successfully', async (): Promise<void> => {
    const result = await service.create('user-uuid-1', {
      title: 'Review PRs',
      description: 'Review pending code refactors',
    })

    expect(result.uuid).toBeDefined()
    expect(result.user_id).toBe('user-uuid-1')
    expect(result.title).toBe('Review PRs')
    expect(result.description).toBe('Review pending code refactors')
    expect(result.completed).toBe(false)
    expect(result.created_at).toBeDefined()
    expect(result.updated_at).toBeDefined()
    expect(mockTodoRepository.create).toHaveBeenCalled()
  })

  it('should retrieve single todo belonging to user', async (): Promise<void> => {
    const result = await service.getTodo('user-uuid-1', 'todo-1')

    expect(result.uuid).toBe('todo-1')
    expect(result.title).toBe('Finish API Key Refactoring')
    expect(result.description).toBe('Finish writing unit tests')
    expect(result.completed).toBe(false)
  })

  it('should throw ObjectNotFoundException when retrieving missing todo', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.getTodo('user-uuid-1', 'missing-todo')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when user is not owner', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.getTodo('user-uuid-2', 'todo-1')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })

  it('should retrieve user todo list', async (): Promise<void> => {
    const result = await service.getTodos('user-uuid-1')

    expect(result.items.length).toBe(1)
    expect(result.items[0]?.uuid).toBe('todo-1')
    expect(result.metadata.total).toBe(1)
  })

  it('should propagate completed filter when retrieving user todo list', async (): Promise<void> => {
    const filter = { completed: true }
    const result = await service.getTodos('user-uuid-1', filter)

    expect(result.items.length).toBe(1)
    expect(mockTodoRepository.findByUserId).toHaveBeenCalledWith('user-uuid-1', filter)
  })

  it('should update todo successfully', async (): Promise<void> => {
    const result = await service.update('user-uuid-1', 'todo-1', {
      title: 'Finish API Key Refactoring (Completed)',
      completed: true,
    })

    expect(result.uuid).toBe('todo-1')
    expect(result.title).toBe('Finish API Key Refactoring (Completed)')
    expect(result.completed).toBe(true)
    expect(result.description).toBe('Finish writing unit tests')
  })

  it('should throw ObjectNotFoundException when updating missing todo', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.update('user-uuid-1', 'missing-todo', {
        title: 'New Title',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when updating todo of another user', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.update('user-uuid-2', 'todo-1', {
        title: 'Stolen Title',
      })
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })

  it('should delete todo successfully', async (): Promise<void> => {
    await service.delete('user-uuid-1', 'todo-1')
    expect(mockTodosDb['todo-1']).toBeUndefined()
  })

  it('should throw ObjectNotFoundException when deleting missing todo', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.delete('user-uuid-1', 'missing-todo')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof ObjectNotFoundException).toBe(true)
  })

  it('should throw InsufficientPermissionException when deleting todo of another user', async (): Promise<void> => {
    let error: unknown = null
    try {
      await service.delete('user-uuid-2', 'todo-1')
    } catch (e: unknown) {
      error = e
    }

    expect(error instanceof InsufficientPermissionException).toBe(true)
  })
})
