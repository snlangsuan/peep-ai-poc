import { db } from '#/common/libs/firebase.lib'
import { getUtcTime } from '#/common/utils/datetime.util'

import type { IMoodEntity, TEmotion, TMoodFilterPayload } from '#/features/moods/v1/mood.type'
import type admin from 'firebase-admin'

export type TMoodSidClaim =
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'already_used'; userId: string }
  | { status: 'claimed'; userId: string }

export class MoodRepository {
  /**
   * Atomically claims a mood-card by its `sid` (`mood_sid` on the chats doc).
   * Read-check-update inside a transaction so concurrent requests for the same
   * sid can't both pass the `mood_used` check. Mirrors the chat mood-link flow.
   * Verifies the card belongs to `userId` before claiming.
   */
  async claimMoodSid(sid: string, userId: string, emotion: TEmotion): Promise<TMoodSidClaim> {
    const snapshot = await db.collection('chats').where('mood_sid', '==', sid).limit(1).get()
    if (snapshot.empty) return { status: 'not_found' }

    const docRef = snapshot.docs[0]!.ref
    const now = getUtcTime().toDate()

    return db.runTransaction(async (tx) => {
      const fresh = await tx.get(docRef)
      const freshData = fresh.data()
      if (!freshData) return { status: 'not_found' }
      if (freshData.user_id !== userId) return { status: 'forbidden' }
      if (freshData.mood_used === true) {
        return { status: 'already_used', userId: freshData.user_id as string }
      }
      tx.update(docRef, {
        mood_used: true,
        mood_selected: emotion,
        mood_selected_at: now,
      })
      return { status: 'claimed', userId: freshData.user_id as string }
    })
  }

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
