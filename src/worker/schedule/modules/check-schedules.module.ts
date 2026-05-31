import admin from 'firebase-admin'

import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { sseBroker } from '#/common/services/sse-broker.service'
import { getLocalTime } from '#/common/utils/datetime.util'

import type { IScheduleModule } from '#/worker/schedule/schedule.type'
import type { Dayjs } from 'dayjs'

export class CheckSchedulesModule implements IScheduleModule {
  readonly name = 'check-schedules'
  readonly cronPattern = '* * * * *'

  private cache = new Map<string, admin.firestore.QueryDocumentSnapshot>()
  private isInitialized = false

  async execute(): Promise<void> {
    try {
      await this.ensureInitialized()

      if (this.cache.size === 0) {
        logger.info('ℹ️ [CheckSchedulesModule] No schedules found in in-memory cache.')
        return
      }

      const now = getLocalTime()
      const oneHourFromNow = now.add(1, 'hour')
      logger.info({ totalSchedules: this.cache.size }, '📊 Processing schedules from in-memory cache...')

      for (const doc of this.cache.values()) {
        const data = doc.data()
        const scheduledAt = this.parseDate(data.scheduled_at)

        if (!scheduledAt) {
          continue
        }

        if (scheduledAt.isAfter(oneHourFromNow)) {
          continue
        }

        await this.processSchedule(doc, now)
      }
    } catch (error) {
      logger.error(error, '❌ [CheckSchedulesModule] Error checking Firestore schedules')
      throw error
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized) return

    logger.info('🚀 [CheckSchedulesModule] Initializing Firestore real-time push listener...')

    await new Promise<void>((resolve, reject) => {
      let isFirstSnapshot = true

      db.collection('schedules')
        .where('sent_at', '==', null)
        .onSnapshot(
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              const docId = change.doc.id

              if (change.type === 'added' || change.type === 'modified') {
                this.cache.set(docId, change.doc)
              } else if (change.type === 'removed') {
                this.cache.delete(docId)
              }
            })

            if (isFirstSnapshot) {
              isFirstSnapshot = false
              logger.info({ cacheSize: this.cache.size }, '🔄 Initial in-memory schedule cache populated.')
              resolve()
            } else {
              logger.info({ cacheSize: this.cache.size }, '🔄 In-memory schedule cache synchronized.')
            }
          },
          (error) => {
            logger.error(error, '❌ Firestore real-time listener error')
            if (isFirstSnapshot) {
              reject(error)
            }
          },
        )
    })

    this.isInitialized = true
  }

  private async processSchedule(doc: admin.firestore.QueryDocumentSnapshot, now: Dayjs): Promise<void> {
    const data = doc.data()
    const scheduledAt = this.parseDate(data.scheduled_at)

    if (!scheduledAt) {
      logger.warn({ scheduleId: doc.id, scheduled_at: data.scheduled_at }, '⚠️ Invalid scheduled_at date. Skipping.')
      return
    }

    const beforeSentAt = this.parseDate(data.before_sent_at)
    const sentAt = this.parseDate(data.sent_at)
    const diffMinutes = scheduledAt.diff(now, 'minute', true)

    logger.debug(
      {
        scheduleId: doc.id,
        scheduledAt: scheduledAt.toISOString(),
        diffMinutes,
        beforeSentAt: beforeSentAt ? beforeSentAt.toISOString() : null,
        sentAt: sentAt ? sentAt.toISOString() : null,
      },
      'Checking schedule timing conditions',
    )

    if (diffMinutes > 0 && diffMinutes <= 15 && !beforeSentAt) {
      await this.handlePreNotification(doc, scheduledAt, data.payload)
    }

    if (diffMinutes <= 0 && !sentAt) {
      await this.handleDueNotification(doc, scheduledAt, data.payload)
    }
  }

  private async handlePreNotification(
    doc: admin.firestore.QueryDocumentSnapshot,
    scheduledAt: Dayjs,
    payload: any,
  ): Promise<void> {
    logger.info({ scheduleId: doc.id }, '🔔 Pre-Notification Triggered (15 minutes prior)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`🔔 [PRE-NOTIFICATION - 15 MINS PRIOR] Schedule ID: ${doc.id}`)
    console.log(`⏰ Scheduled At: ${scheduledAt.format('YYYY-MM-DD HH:mm:ss')}`)
    console.log(`📦 Payload: ${JSON.stringify(payload || {}, null, 2)}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    await doc.ref.update({
      before_sent_at: admin.firestore.FieldValue.serverTimestamp(),
    })
    logger.info({ scheduleId: doc.id }, '✅ Updated before_sent_at timestamp in Firestore')

    // Add chatbot message to the chats collection so it appears in history
    const data = doc.data()
    const userId = data.user_id || data.userId
    const title = payload?.title || payload?.message || 'ไม่มีหัวข้อ'
    const desc = payload?.description ? ` (${payload.description})` : ''
    const loc = payload?.location ? ` ที่ ${payload.location}` : ''
    const notificationMessage = `⏰ [แจ้งเตือนล่วงหน้า 15 นาที] อีก 15 นาที มีนัดหมาย: "${title}"${loc}${desc}`

    if (userId) {
      await this.saveAndEmitNotification(userId, notificationMessage)
      logger.info({ scheduleId: doc.id, userId }, '💬 Saved pre-notification message to chats collection')
    }
  }

  private async handleDueNotification(
    doc: admin.firestore.QueryDocumentSnapshot,
    scheduledAt: Dayjs,
    payload: any,
  ): Promise<void> {
    logger.info({ scheduleId: doc.id }, '🔔 Notification Triggered (Exact Scheduled Time)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`🔔 [NOTIFICATION - DUE NOW] Schedule ID: ${doc.id}`)
    console.log(`⏰ Scheduled At: ${scheduledAt.format('YYYY-MM-DD HH:mm:ss')}`)
    console.log(`📦 Payload: ${JSON.stringify(payload || {}, null, 2)}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    await doc.ref.update({
      sent_at: admin.firestore.FieldValue.serverTimestamp(),
    })
    logger.info({ scheduleId: doc.id }, '✅ Updated sent_at timestamp in Firestore')

    // Add chatbot message to the chats collection so it appears in history
    const data = doc.data()
    const userId = data.user_id || data.userId
    const title = payload?.title || payload?.message || 'ไม่มีหัวข้อ'
    const desc = payload?.description ? ` (${payload.description})` : ''
    const loc = payload?.location ? ` ที่ ${payload.location}` : ''
    const notificationMessage = `🔔 [แจ้งเตือน] ถึงเวลาแล้วจ้า: "${title}"${loc}${desc}`

    if (userId) {
      await this.saveAndEmitNotification(userId, notificationMessage)
      logger.info({ scheduleId: doc.id, userId }, '💬 Saved due-notification message to chats collection')
    }
  }

  /** Persist a text-only bot notification + emit SSE bot_message in the new content-array shape. */
  private async saveAndEmitNotification(userId: string, text: string): Promise<void> {
    const content = [{ type: 'text' as const, text }]
    const createdAt = new Date()
    const docRef = await db.collection('chats').add({
      user_id: userId,
      sender_id: 'bot',
      content,
      feedback: null,
      error: null,
      created_at: createdAt,
    })
    sseBroker.emit(userId, {
      type: 'bot_message',
      message: {
        id: docRef.id,
        sender_id: 'bot',
        content,
        created_at: createdAt.toISOString(),
        feedback: null,
      },
    })
  }

  private parseDate(val: any): Dayjs | null {
    if (!val) return null
    let dateObj: Date
    if (typeof val.toDate === 'function') {
      dateObj = val.toDate()
    } else if (val instanceof admin.firestore.Timestamp) {
      dateObj = val.toDate()
    } else {
      dateObj = new Date(val)
    }
    if (isNaN(dateObj.getTime())) return null
    return getLocalTime(dateObj)
  }
}
