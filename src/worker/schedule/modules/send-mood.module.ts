import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { createMoodCardChat } from '#/features/chats/v1/mood-card.helper'

import type { IScheduleModule } from '#/worker/schedule/schedule.type'

export class SendMoodToAllModule implements IScheduleModule {
  readonly name = 'send-mood-to-all'
  readonly cronPattern = '0 18 * * *' // 6:00 PM daily
  readonly timezone = 'Asia/Bangkok'

  async execute(): Promise<void> {
    logger.info('👥 [SendMoodToAllModule] Querying users collection in Firestore...')

    try {
      const snapshot = await db.collection('users').get()

      let users: { id: string; name: string }[] = []

      if (snapshot.empty) {
        logger.warn(
          'ℹ️ [SendMoodToAllModule] "users" collection is empty in Firestore. Falling back to mock users list for testing.',
        )
        users = [
          { id: 'mock_user_1', name: 'สมชาย รักดี' },
          { id: 'mock_user_2', name: 'สมศรี มั่งมี' },
          { id: 'mock_user_3', name: 'John Doe' },
        ]
      } else {
        users = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            id: doc.id,
            name: data.name || data.displayName || `User #${doc.id.substring(0, 5)}`,
          }
        })
      }

      logger.info({ totalUsers: users.length }, '💬 Sending daily mood survey to users...')

      for (const user of users) {
        const { id, sid } = await createMoodCardChat(user.id)
        logger.info(
          { userId: user.id, name: user.name, chatId: id, sid },
          '💬 [DAILY MOOD SURVEY] sent',
        )
      }

      logger.info('✅ [SendMoodToAllModule] Completed sending mood survey to all users.')
    } catch (error) {
      logger.error(error, '❌ [SendMoodToAllModule] Error executing mood survey')
      throw error
    }
  }
}
