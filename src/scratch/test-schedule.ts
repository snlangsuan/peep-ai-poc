import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { CheckSchedulesModule } from '#/worker/schedule/modules/check-schedules.module'
import { SendMoodToAllModule } from '#/worker/schedule/modules/send-mood.module'

async function run() {
  logger.info('--- RUNNING MODULAR SCHEDULE WORKER TEST ---')

  // 1. Let's create some dummy test schedules in Firestore "schedules" collection
  logger.info('Creating test schedules in Firestore "schedules" collection...')
  const now = new Date()

  // Schedule A: 10 minutes in the future (Should trigger Pre-Notification 1.1)
  const scheduleRefA = db.collection('schedules').doc('test_schedule_10mins')
  await scheduleRefA.set({
    scheduled_at: new Date(now.getTime() + 10 * 60 * 1000), // 10 minutes from now
    before_sent_at: null,
    sent_at: null,
    payload: {
      message: 'This is a pre-notification test (10 mins in future)',
      type: 'test_a',
    },
  })

  // Schedule B: 5 minutes in the past (Should trigger exact Notification 1.2)
  const scheduleRefB = db.collection('schedules').doc('test_schedule_past')
  await scheduleRefB.set({
    scheduled_at: new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes in the past
    before_sent_at: null,
    sent_at: null,
    payload: {
      message: 'This is a final notification test (5 mins in past)',
      type: 'test_b',
    },
  })

  logger.info('Schedules created successfully. Executing CheckSchedulesModule...')
  const checkSchedules = new CheckSchedulesModule()
  await checkSchedules.execute()

  // 2. Testing Daily Mood Survey
  logger.info('Executing SendMoodToAllModule...')
  const sendMood = new SendMoodToAllModule()
  await sendMood.execute()

  // Clean up test schedules from Firestore
  logger.info('Cleaning up test schedules...')
  await scheduleRefA.delete()
  await scheduleRefB.delete()

  logger.info('--- TEST FINISHED SUCCESSFULLY ---')
  process.exit(0)
}

run().catch((error) => {
  logger.error(error)
  process.exit(1)
})
