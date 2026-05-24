import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'

async function run() {
  logger.info('Deleting old schedule_19_20 from Firestore...')
  await db.collection('schedules').doc('schedule_19_20').delete()

  logger.info('Adding new 19:35 test schedule to Firestore...')
  const scheduledTime = new Date('2026-05-22T19:35:00+07:00')

  const docRef = db.collection('schedules').doc('schedule_19_35')
  await docRef.set({
    scheduled_at: scheduledTime,
    before_sent_at: null,
    sent_at: null,
    payload: {
      message: 'นี่คือข้อความทดสอบจาก schedule เวลา 19:35',
      type: 'user_schedule',
    },
  })

  logger.info({ id: docRef.id, scheduled_at: scheduledTime.toISOString() }, '✅ New test schedule added successfully')
  process.exit(0)
}

run().catch((error) => {
  logger.error(error)
  process.exit(1)
})
