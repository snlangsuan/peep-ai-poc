import admin from 'firebase-admin'

import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
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
