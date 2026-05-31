import { db } from '#/common/libs/firebase.lib'

import type { IMoodEntity, TMoodFilterPayload } from '#/features/moods/v1/mood.type'
import type admin from 'firebase-admin'

export class MoodRepository {
  async create(input: IMoodEntity): Promise<IMoodEntity> {
    await db
      .collection('user_moods')
      .doc(input.uuid)
      .set({
        uuid: input.uuid,
        user_id: input.user_id,
        // DB field is `mood` (kept for backward compatibility with existing records
        // and chat-side writers that use `mood`). API contract exposes it as `emotion`.
        mood: input.emotion,
        note: input.note ?? null,
        date: input.date,
        created_at: input.created_at,
        updated_at: input.updated_at,
      })

    return input
  }

  async list(
    userId: string,
    filter: Partial<TMoodFilterPayload>,
  ): Promise<{ data: IMoodEntity[]; total: number }> {
    const query = db.collection('user_moods').where('user_id', '==', userId)
    const snapshot = await query.get()
    let docs = snapshot.docs.map((d) => this.mapToResponse(d.data()))

    if (filter.start_date) {
      docs = docs.filter((doc) => doc.date >= filter.start_date!)
    }
    if (filter.end_date) {
      docs = docs.filter((doc) => doc.date <= filter.end_date!)
    }
    if (filter.emotion) {
      docs = docs.filter((doc) => doc.emotion === filter.emotion)
    }

    const total = docs.length

    const sortField = filter.sort || 'date'
    const desc = filter.desc ?? true
    docs.sort((a, b) => {
      const valA = a[sortField as keyof IMoodEntity]
      const valB = b[sortField as keyof IMoodEntity]

      if (valA === undefined || valA === null) return desc ? 1 : -1
      if (valB === undefined || valB === null) return desc ? -1 : 1

      const strA = String(valA)
      const strB = String(valB)
      return desc ? strB.localeCompare(strA) : strA.localeCompare(strB)
    })

    const limit = filter.limit ?? 25
    const page = filter.page ?? 1
    const offset = (page - 1) * limit
    const paginatedData = docs.slice(offset, offset + limit)

    return {
      data: paginatedData,
      total,
    }
  }

  private mapToResponse(data: admin.firestore.DocumentData): IMoodEntity {
    const createdAt = data.created_at?.toDate
      ? (data.created_at.toDate() as Date).toISOString()
      : (data.created_at as string)
    const updatedAt = data.updated_at?.toDate
      ? (data.updated_at.toDate() as Date).toISOString()
      : ((data.updated_at as string) ?? createdAt)

    return {
      uuid: data.uuid as string,
      user_id: data.user_id as string,
      emotion: data.mood as IMoodEntity['emotion'],
      note: (data.note ?? null) as string | null,
      date: data.date as string,
      created_at: createdAt,
      updated_at: updatedAt,
    }
  }
}
