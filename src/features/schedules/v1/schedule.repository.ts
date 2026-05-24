import { db } from '#/common/libs/firebase.lib'
import { getLocalTime, convertToLocalTime, convertToUtcTime } from '#/common/utils/datetime.util'

import type {
  TScheduleFilterPayload,
  TScheduleCreateInput,
  TScheduleResponse,
} from '#/features/schedules/v1/schedule.type'
import type admin from 'firebase-admin'

export class ScheduleRepository {
  async create(input: TScheduleCreateInput): Promise<void> {
    await db
      .collection('schedules')
      .doc(input.uuid)
      .set({
        uuid: input.uuid,
        user_id: input.user_id,
        scheduled_at: convertToUtcTime(input.scheduled_at).toDate(),
        before_sent_at: input.before_sent_at ? convertToUtcTime(input.before_sent_at).toDate() : null,
        sent_at: input.sent_at ? convertToUtcTime(input.sent_at).toDate() : null,
        payload: {
          message: input.payload.message,
          type: input.payload.type,
          title: input.payload.title,
          description: input.payload.description ?? null,
          location: input.payload.location ?? null,
        },
        created_at: input.created_at,
        updated_at: input.updated_at,
      })
  }

  async findById(uuid: string): Promise<TScheduleResponse | null> {
    const doc = await db.collection('schedules').doc(uuid).get()
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
    filter?: Partial<TScheduleFilterPayload>,
  ): Promise<{ data: TScheduleResponse[]; total: number }> {
    const query = db.collection('schedules').where('user_id', '==', userId)

    const querySnapshot = await query.get()
    let docs = querySnapshot.docs.map((doc) => this.mapToResponse(doc.data()))

    docs = this.applyFilters(docs, filter)
    const total = docs.length

    if (filter) {
      const sortField = filter.sort || 'scheduled_at'
      const desc = filter.desc ?? true
      this.applySorting(docs, sortField, desc)

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

  private applyFilters(docs: TScheduleResponse[], filter?: Partial<TScheduleFilterPayload>): TScheduleResponse[] {
    if (!filter) {
      return docs
    }

    let result = docs
    if (filter.start_date) {
      const startBoundary = this.parseFilterDateTime(filter.start_date)
      result = result.filter((doc) => convertToLocalTime(doc.scheduled_at).valueOf() >= startBoundary)
    }
    if (filter.end_date) {
      const endBoundary = this.parseFilterDateTime(filter.end_date)
      result = result.filter((doc) => convertToLocalTime(doc.scheduled_at).valueOf() <= endBoundary)
    }
    return result
  }

  private applySorting(docs: TScheduleResponse[], sortField: string, desc: boolean): void {
    docs.sort((a, b) => {
      const valA = (a as any)[sortField]
      const valB = (b as any)[sortField]

      if (valA === undefined || valA === null) {
        return desc ? 1 : -1
      }
      if (valB === undefined || valB === null) {
        return desc ? -1 : 1
      }

      if (typeof valA === 'number' && typeof valB === 'number') {
        return desc ? valB - valA : valA - valB
      }

      const strA = String(valA)
      const strB = String(valB)
      return desc ? strB.localeCompare(strA) : strA.localeCompare(strB)
    })
  }

  async update(uuid: string, fields: Partial<TScheduleCreateInput>): Promise<void> {
    const updateData: Record<string, any> = {}

    if (fields.updated_at !== undefined) {
      updateData.updated_at = fields.updated_at
    }
    if (fields.scheduled_at !== undefined) {
      updateData.scheduled_at = convertToUtcTime(fields.scheduled_at).toDate()
    }
    if (fields.before_sent_at !== undefined) {
      updateData.before_sent_at = fields.before_sent_at ? convertToUtcTime(fields.before_sent_at).toDate() : null
    }
    if (fields.sent_at !== undefined) {
      updateData.sent_at = fields.sent_at ? convertToUtcTime(fields.sent_at).toDate() : null
    }
    if (fields.payload !== undefined) {
      updateData.payload = {
        message: fields.payload.message,
        type: fields.payload.type,
        title: fields.payload.title,
        description: fields.payload.description ?? null,
        location: fields.payload.location ?? null,
      }
    }

    await db.collection('schedules').doc(uuid).update(updateData)
  }

  async delete(uuid: string): Promise<void> {
    await db.collection('schedules').doc(uuid).delete()
  }

  private parseFilterDateTime(str: string): number {
    const parsed = getLocalTime(str).valueOf()
    if (isNaN(parsed)) {
      throw new Error(`Invalid datetime format: ${str}`)
    }
    return parsed
  }

  private mapToResponse(data: admin.firestore.DocumentData): TScheduleResponse {
    const scheduledAtDate = convertToUtcTime(
      data.scheduled_at?.toDate ? data.scheduled_at.toDate() : data.scheduled_at,
    ).toDate()
    const beforeSentAtDate = data.before_sent_at
      ? convertToUtcTime(data.before_sent_at.toDate ? data.before_sent_at.toDate() : data.before_sent_at).toDate()
      : null
    const sentAtDate = data.sent_at
      ? convertToUtcTime(data.sent_at.toDate ? data.sent_at.toDate() : data.sent_at).toDate()
      : null

    return {
      uuid: data.uuid,
      userId: data.user_id || data.userId,
      scheduled_at: scheduledAtDate.toISOString(),
      before_sent_at: beforeSentAtDate ? beforeSentAtDate.toISOString() : null,
      sent_at: sentAtDate ? sentAtDate.toISOString() : null,
      payload: {
        message: data.payload?.message || data.payload?.title || '',
        type: data.payload?.type || 'user_schedule',
        title: data.payload?.title || '',
        description: data.payload?.description ?? null,
        location: data.payload?.location ?? null,
      },
      createdAt: data.created_at || data.createdAt,
      updatedAt: data.updated_at || data.updatedAt,
    }
  }
}
