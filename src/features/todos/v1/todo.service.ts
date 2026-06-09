import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import ObjectNotFoundException from '#/common/exceptions/object.not.found.exception'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

import type { TodoRepository } from '#/features/todos/v1/todo.repository'
import type {
  ITodoCreateInput,
  TTodoCreateItem,
  TTodoResponse,
  TTodoUpdateFields,
  TTodoUpdateItem,
  TTodoFilterPayload,
  TTodoItemResponse,
} from '#/features/todos/v1/todo.type'

export class TodoService {
  private repository: TodoRepository

  constructor(repository: TodoRepository) {
    this.repository = repository
  }

  async create(userId: string, input: TTodoCreateItem): Promise<TTodoResponse> {
    const newTodo = this.buildCreateInput(userId, input, getUtcTime().toISOString())

    await this.repository.create(newTodo)

    return this.toResponse(newTodo)
  }

  async createMany(userId: string, items: TTodoCreateItem[]): Promise<TTodoResponse[]> {
    const now = getUtcTime().toISOString()
    const inputs = items.map((item) => this.buildCreateInput(userId, item, now))

    await this.repository.createMany(inputs)

    return inputs.map((input) => this.toResponse(input))
  }

  private buildCreateInput(userId: string, input: TTodoCreateItem, now: string): ITodoCreateInput {
    return {
      uuid: getUUID(),
      user_id: userId,
      title: input.title,
      description: input.description ?? null,
      completed: false,
      created_at: now,
      updated_at: now,
    }
  }

  private toResponse(input: ITodoCreateInput): TTodoResponse {
    return {
      uuid: input.uuid,
      user_id: input.user_id,
      title: input.title,
      description: input.description ?? null,
      completed: input.completed,
      created_at: input.created_at,
      updated_at: input.updated_at,
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

  async update(userId: string, uuid: string, input: TTodoUpdateFields): Promise<TTodoResponse> {
    const todo = await this.repository.findById(uuid)

    if (!todo) {
      throw new ObjectNotFoundException('Todo not found.')
    }

    if (todo.user_id !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this todo.')
    }

    const fields = this.buildUpdateFields(input, getUtcTime().toISOString())

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

  async updateMany(userId: string, items: TTodoUpdateItem[]): Promise<TTodoResponse[]> {
    // Verify ownership of every target up front so the batch is all-or-nothing:
    // if any todo is missing or not owned by the user, nothing is written.
    const existing = await Promise.all(items.map((item) => this.repository.findById(item.uuid)))

    existing.forEach((todo, i) => {
      const uuid = items[i]!.uuid
      if (!todo) {
        throw new ObjectNotFoundException(`Todo not found: ${uuid}`)
      }
      if (todo.user_id !== userId) {
        throw new InsufficientPermissionException(`You do not have permission to access todo: ${uuid}`)
      }
    })

    const now = getUtcTime().toISOString()
    const updates = items.map((item) => ({
      uuid: item.uuid,
      fields: this.buildUpdateFields(item, now),
    }))

    await this.repository.updateMany(updates)

    // Merge the applied fields onto the pre-read docs — avoids a second read round-trip.
    return items.map((item, i) => {
      const before = existing[i]!
      return {
        uuid: item.uuid,
        user_id: userId,
        title: (item.title ?? before.title) as string,
        description: (item.description !== undefined ? (item.description ?? null) : (before.description ?? null)) as
          | string
          | null,
        completed: (item.completed ?? before.completed) as boolean,
        created_at: before.created_at as string,
        updated_at: now,
      }
    })
  }

  private buildUpdateFields(input: TTodoUpdateFields, now: string): Partial<ITodoCreateInput> {
    const fields: Partial<ITodoCreateInput> = { updated_at: now }

    if (input.title !== undefined) {
      fields.title = input.title
    }
    if (input.description !== undefined) {
      fields.description = input.description ?? null
    }
    if (input.completed !== undefined) {
      fields.completed = input.completed
    }

    return fields
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
