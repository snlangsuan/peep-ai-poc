import dayjs from 'dayjs'
import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'

import type {
  TScheduleResponse,
  TScheduleListResponse,
  TCreateSchedule,
  TScheduleListFilter,
} from '#/features/schedules/v1/schedule.type'

export class ScheduleRepository {
  private readonly collection = db.collection('schedules')

  async create(user_id: string, data: TCreateSchedule): Promise<TScheduleResponse> {
    const now = new Date()
    logger.info({ user_id, data }, 'ScheduleRepository.create start')

    // Combine date and time into a single Date object
    const scheduledAt = data.time ? dayjs(`${data.date} ${data.time}`).toDate() : dayjs(data.date).toDate()
    logger.info({ scheduledAt }, 'Calculated scheduledAt')

    try {
      // Deduplication check: query for schedules at the exact same time for this user
      const recentSchedulesSnapshot = await this.collection
        .where('created_by', '==', user_id)
        .where('scheduled_at', '==', scheduledAt)
        .get()

      logger.info({ count: recentSchedulesSnapshot.docs.length }, 'Fetched recent schedules for deduplication')
      
      // Log all titles and times for debugging
      const existingEntries = recentSchedulesSnapshot.docs.map(doc => {
        const d = doc.data()
        const docTime = d.scheduled_at.toDate ? d.scheduled_at.toDate().getTime() : new Date(d.scheduled_at).getTime()
        return { title: d.title, time: new Date(docTime).toISOString() }
      })
      logger.info({ existingEntries, targetTitle: data.title, targetTime: scheduledAt.toISOString() }, 'Existing schedules in DB')

      const isDuplicate = recentSchedulesSnapshot.docs.some(doc => {
        const d = doc.data()
        if (!d.scheduled_at || !d.title) return false
        const docTime = d.scheduled_at.toDate ? d.scheduled_at.toDate().getTime() : new Date(d.scheduled_at).getTime()
        const newTime = scheduledAt.getTime()
        
        const match = d.title.trim().toLowerCase() === data.title.trim().toLowerCase() && docTime === newTime
        return match
      })

      if (isDuplicate) {
        logger.info('Duplicate schedule found, returning existing one')
        const duplicateDoc = recentSchedulesSnapshot.docs.find(doc => {
          const d = doc.data()
          const docTime = d.scheduled_at.toDate ? d.scheduled_at.toDate().getTime() : new Date(d.scheduled_at).getTime()
          return d.title.trim().toLowerCase() === data.title.trim().toLowerCase() && docTime === scheduledAt.getTime()
        })
        
        if (duplicateDoc) {
          const result = this.mapToResponse(duplicateDoc.data())
          return { ...result, _is_duplicate: true } as any
        }
      }
    } catch (dbError) {
      logger.error({ dbError }, 'Error during deduplication check')
    }

    const docRef = this.collection.doc()
    const remindBefore = data.remind_before_minutes ?? 10
    const remindAt = dayjs(scheduledAt).subtract(remindBefore, 'minute').toDate()

    const scheduleData = {
      id: docRef.id,
      ...data,
      scheduled_at: scheduledAt,
      remind_at: remindAt,
      remind_before_minutes: remindBefore,
      notified: false,
      created_by: user_id,
      created_at: now,
      updated_at: now,
    }

    logger.info({ id: docRef.id }, 'Attempting to save new schedule to Firestore')
    await docRef.set(scheduleData)
    logger.info('Schedule saved successfully')
    
    return this.mapToResponse(scheduleData)
  }

  async list(user_id: string, filter: TScheduleListFilter): Promise<TScheduleListResponse> {
    const { page, limit, start_date, end_date, sort, desc } = filter

    let query = this.collection.where('created_by', '==', user_id)

    if (start_date) {
      query = query.where('scheduled_at', '>=', dayjs(start_date, 'YYYY-MM-DD HH:mm').toDate())
    }
    if (end_date) {
      query = query.where('scheduled_at', '<=', dayjs(end_date, 'YYYY-MM-DD HH:mm').toDate())
    }

    // Get total count
    const countSnapshot = await query.count().get()
    const total = countSnapshot.data().count

    const sortField = sort || 'scheduled_at'
    const orderDirection = desc ? 'desc' : 'asc'

    if ((start_date || end_date) && sortField !== 'scheduled_at') {
      query = query.orderBy('scheduled_at', orderDirection)
    }

    const snapshot = await query
      .orderBy(sortField, orderDirection)
      .limit(limit)
      .offset((page - 1) * limit)
      .get()

    const items = snapshot.docs.map((doc) => this.mapToResponse(doc.data()))

    return {
      metadata: {
        total,
        count: items.length,
        page,
        limit,
      },
      items,
    }
  }

  async getById(user_id: string, id: string): Promise<TScheduleResponse | null> {
    const doc = await this.collection.doc(id).get()
    if (!doc.exists) return null

    const data = doc.data()
    if (data?.created_by !== user_id) return null

    return this.mapToResponse(data)
  }

  async update(user_id: string, id: string, data: Partial<TCreateSchedule>): Promise<TScheduleResponse | null> {
    const docRef = this.collection.doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return null

    const existingData = doc.data()
    if (existingData?.created_by !== user_id) return null

    const now = new Date()
    const updateData: any = {
      ...data,
      updated_at: now,
    }

    // Recalculate scheduled_at and remind_at if date, time, or remind_before_minutes changes
    if (data.date || data.time || data.remind_before_minutes !== undefined) {
      const newDate = data.date || existingData?.date
      const newTime = data.time || existingData?.time
      const scheduledAt = newTime ? dayjs(`${newDate} ${newTime}`).toDate() : dayjs(newDate).toDate()
      const remindBefore = data.remind_before_minutes ?? existingData?.remind_before_minutes ?? 10
      
      updateData.scheduled_at = scheduledAt
      updateData.remind_at = dayjs(scheduledAt).subtract(remindBefore, 'minute').toDate()
      updateData.remind_before_minutes = remindBefore
      
      // Reset notified if time changed to future
      if (dayjs(scheduledAt).isAfter(dayjs())) {
        updateData.notified = false
      }
    }

    await docRef.update(updateData)
    return this.getById(user_id, id)
  }

  async delete(user_id: string, id: string): Promise<boolean> {
    const docRef = this.collection.doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return false

    const data = doc.data()
    if (data?.created_by !== user_id) return false

    await docRef.delete()
    return true
  }

  async listPending(): Promise<TScheduleResponse[]> {
    const now = new Date()
    // Query only by notified to avoid needing a composite index for remind_at range
    const snapshot = await this.collection
      .where('notified', '==', false)
      .limit(100)
      .get()

    return snapshot.docs
      .map(doc => this.mapToResponse(doc.data()))
      .filter(s => s.remind_at && s.remind_at <= now)
  }

  async markAsNotified(id: string): Promise<void> {
    await this.collection.doc(id).update({ notified: true })
  }

  private mapToResponse(data: any): TScheduleResponse {
    return {
      ...data,
      scheduled_at: data.scheduled_at?.toDate ? data.scheduled_at.toDate() : data.scheduled_at,
      remind_at: data.remind_at?.toDate ? data.remind_at.toDate() : data.remind_at,
      created_at: data.created_at?.toDate ? data.created_at.toDate() : data.created_at,
      updated_at: data.updated_at?.toDate ? data.updated_at.toDate() : data.updated_at,
    } as unknown as TScheduleResponse
  }
}
