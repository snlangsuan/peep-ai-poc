import { db } from '#/common/libs/firebase.lib'

import type { ITodoCreateInput, TTodoFilterPayload } from '#/features/todos/v1/todo.type'
import type admin from 'firebase-admin'

export class TodoRepository {
  async create(input: ITodoCreateInput): Promise<void> {
    await db
      .collection('todos')
      .doc(input.uuid)
      .set({
        uuid: input.uuid,
        user_id: input.user_id,
        title: input.title,
        description: input.description ?? null,
        completed: input.completed,
        created_at: input.created_at,
        updated_at: input.updated_at,
      })
  }

  async createMany(inputs: ITodoCreateInput[]): Promise<void> {
    if (inputs.length === 0) return

    // Firestore batches are capped at 500 ops; the create payload caps todos at 50,
    // but chunk defensively to stay safe regardless of caller.
    for (let i = 0; i < inputs.length; i += 450) {
      const batch = db.batch()
      for (const input of inputs.slice(i, i + 450)) {
        const ref = db.collection('todos').doc(input.uuid)
        batch.set(ref, {
          uuid: input.uuid,
          user_id: input.user_id,
          title: input.title,
          description: input.description ?? null,
          completed: input.completed,
          created_at: input.created_at,
          updated_at: input.updated_at,
        })
      }
      await batch.commit()
    }
  }

  async findById(uuid: string): Promise<admin.firestore.DocumentData | null> {
    const doc = await db.collection('todos').doc(uuid).get()
    if (!doc.exists) {
      return null
    }
    const data = doc.data()
    if (!data) {
      return null
    }
    return this.mapToResponse(data)
  }

  async findByUserId(
    userId: string,
    filter?: Partial<TTodoFilterPayload>,
  ): Promise<{ data: admin.firestore.DocumentData[]; total: number }> {
    const query = db.collection('todos').where('user_id', '==', userId)

    const querySnapshot = await query.get()
    let docs = querySnapshot.docs.map((doc) => this.mapToResponse(doc.data()))

    if (filter && filter.completed !== undefined) {
      docs = docs.filter((doc) => doc.completed === filter.completed)
    }

    const total = docs.length

    if (filter) {
      const sortField = filter.sort || 'created_at'
      const desc = filter.desc ?? true
      docs.sort((a, b) => this.compareValues(a[sortField], b[sortField], desc))

      const limit = filter.limit ?? 25
      const page = filter.page ?? 1
      const offset = (page - 1) * limit
      docs = docs.slice(offset, offset + limit)
    }

    return {
      data: docs,
      total,
    }
  }

  async update(uuid: string, fields: Partial<ITodoCreateInput>): Promise<void> {
    const updateData: Record<string, any> = {
      updated_at: fields.updated_at,
    }

    if (fields.title !== undefined) {
      updateData.title = fields.title
    }
    if (fields.description !== undefined) {
      updateData.description = fields.description ?? null
    }
    if (fields.completed !== undefined) {
      updateData.completed = fields.completed
    }

    await db.collection('todos').doc(uuid).update(updateData)
  }

  async updateMany(updates: Array<{ uuid: string; fields: Partial<ITodoCreateInput> }>): Promise<void> {
    if (updates.length === 0) return

    // Firestore batches are capped at 500 ops; the update payload caps todos at 50,
    // but chunk defensively to stay safe regardless of caller.
    for (let i = 0; i < updates.length; i += 450) {
      const batch = db.batch()
      for (const { uuid, fields } of updates.slice(i, i + 450)) {
        const ref = db.collection('todos').doc(uuid)
        const updateData: Record<string, any> = {
          updated_at: fields.updated_at,
        }
        if (fields.title !== undefined) {
          updateData.title = fields.title
        }
        if (fields.description !== undefined) {
          updateData.description = fields.description ?? null
        }
        if (fields.completed !== undefined) {
          updateData.completed = fields.completed
        }
        batch.update(ref, updateData)
      }
      await batch.commit()
    }
  }

  async delete(uuid: string): Promise<void> {
    await db.collection('todos').doc(uuid).delete()
  }

  private mapToResponse(data: admin.firestore.DocumentData): admin.firestore.DocumentData {
    return {
      uuid: data.uuid,
      user_id: data.user_id,
      title: data.title,
      description: data.description ?? null,
      completed: data.completed ?? false,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }
  }

  private compareValues(valA: unknown, valB: unknown, desc: boolean): number {
    const dir = desc ? 1 : -1

    if (valA == null) return dir
    if (valB == null) return -dir

    if (typeof valA === 'number' && typeof valB === 'number') {
      return (valB - valA) * dir
    }
    if (typeof valA === 'boolean' && typeof valB === 'boolean') {
      return (Number(valB) - Number(valA)) * dir
    }

    const strA = String(valA)
    const strB = String(valB)
    return strB.localeCompare(strA) * dir
  }
}
