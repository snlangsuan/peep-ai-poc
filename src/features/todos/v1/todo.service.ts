import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import ObjectNotFoundException from '#/common/exceptions/object.not.found.exception'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

import type { TodoRepository } from '#/features/todos/v1/todo.repository'
import type {
  ITodoCreateInput,
  TTodoCreatePayload,
  TTodoResponse,
  TTodoUpdatePayload,
  TTodoFilterPayload,
  TTodoItemResponse,
} from '#/features/todos/v1/todo.type'

export class TodoService {
  private repository: TodoRepository

  constructor(repository: TodoRepository) {
    this.repository = repository
  }

  async create(userId: string, input: TTodoCreatePayload): Promise<TTodoResponse> {
    const uuid = getUUID()
    const now = getUtcTime().toISOString()

    const newTodo: ITodoCreateInput = {
      uuid,
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      completed: false,
      created_at: now,
      updated_at: now,
    }

    await this.repository.create(newTodo)

    return {
      uuid: newTodo.uuid,
      user_id: newTodo.user_id,
      title: newTodo.title,
      description: newTodo.description ?? null,
      completed: newTodo.completed,
      created_at: newTodo.created_at,
      updated_at: newTodo.updated_at,
    }
  }

  async getTodo(userId: string, uuid: string): Promise<TTodoResponse> {
    const todo = await this.repository.findById(uuid)

    if (!todo) {
      throw new ObjectNotFoundException('Todo not found.')
    }

    if (todo.user_id !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this todo.')
    }

    return {
      uuid: todo.uuid as string,
      user_id: todo.user_id as string,
      title: todo.title as string,
      description: (todo.description ?? null) as string | null,
      completed: todo.completed as boolean,
      created_at: todo.created_at as string,
      updated_at: todo.updated_at as string,
    }
  }

  async getTodos(userId: string, filter?: Partial<TTodoFilterPayload>): Promise<TTodoItemResponse> {
    const { data, total } = await this.repository.findByUserId(userId, filter)
    const limit = filter?.limit ?? 25
    const page = filter?.page ?? 1

    return {
      items: data.map((todo) => ({
        uuid: todo.uuid as string,
        user_id: todo.user_id as string,
        title: todo.title as string,
        description: (todo.description ?? null) as string | null,
        completed: todo.completed as boolean,
        created_at: todo.created_at as string,
        updated_at: todo.updated_at as string,
      })),
      metadata: {
        total,
        count: data.length,
        page,
        limit,
      },
    }
  }

  async update(userId: string, uuid: string, input: TTodoUpdatePayload): Promise<TTodoResponse> {
    const todo = await this.repository.findById(uuid)

    if (!todo) {
      throw new ObjectNotFoundException('Todo not found.')
    }

    if (todo.user_id !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this todo.')
    }

    const fields: Partial<ITodoCreateInput> = {
      updated_at: getUtcTime().toISOString(),
    }

    if (input.title !== undefined) {
      fields.title = input.title
    }
    if (input.description !== undefined) {
      fields.description = input.description ?? null
    }
    if (input.completed !== undefined) {
      fields.completed = input.completed
    }

    await this.repository.update(uuid, fields)

    const updated = await this.repository.findById(uuid)
    if (!updated) {
      throw new ObjectNotFoundException('Todo not found after update.')
    }

    return {
      uuid: updated.uuid as string,
      user_id: updated.user_id as string,
      title: updated.title as string,
      description: (updated.description ?? null) as string | null,
      completed: updated.completed as boolean,
      created_at: updated.created_at as string,
      updated_at: updated.updated_at as string,
    }
  }

  async delete(userId: string, uuid: string): Promise<void> {
    const todo = await this.repository.findById(uuid)

    if (!todo) {
      throw new ObjectNotFoundException('Todo not found.')
    }

    if (todo.user_id !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this todo.')
    }

    await this.repository.delete(uuid)
  }
}
