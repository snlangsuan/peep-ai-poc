import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { ChatAgent } from '#/core/chat/chat-agent'
import { getUtcTime } from '#/common/utils/datetime.util'

import type { TChatAgentThinkingStatus } from '#/core/chat/chat.type'

const TOTAL_RECORDS = 100
const HISTORY_WINDOW = 20
const BOUNDARY_INDEX = TOTAL_RECORDS - HISTORY_WINDOW

async function seedChatHistory(userId: string): Promise<void> {
  logger.info(`Seeding ${TOTAL_RECORDS} mock chat records for user: ${userId}`)

  const batch = db.batch()
  const baseTime = getUtcTime().subtract(TOTAL_RECORDS * 2, 'minutes')

  for (let i = 1; i <= TOTAL_RECORDS; i++) {
    const userRef = db.collection('chats').doc()
    const botRef = db.collection('chats').doc()
    const timestamp = baseTime.add(i * 2 - 1, 'minutes').toDate()
    const botTimestamp = baseTime.add(i * 2, 'minutes').toDate()

    batch.set(userRef, {
      user_id: userId,
      sender_id: userId,
      message: `[record ${i}] ผมชอบ ${getTopicForIndex(i)}`,
      created_at: timestamp,
    })

    batch.set(botRef, {
      user_id: userId,
      sender_id: 'bot',
      message: `ทราบแล้วครับ คุณชอบ ${getTopicForIndex(i)} ฉันจำไว้ให้`,
      created_at: botTimestamp,
    })
  }

  await batch.commit()
  logger.info(`Seeded ${TOTAL_RECORDS * 2} documents (user + bot turns) successfully.`)
}

function getTopicForIndex(i: number): string {
  const topics = [
    'กาแฟดำ', 'ปั่นจักรยาน', 'อ่านหนังสือ', 'ดูหนัง sci-fi', 'เล่นกีต้าร์',
    'ทำอาหารไทย', 'วิ่งตอนเช้า', 'ถ่ายรูป', 'ฟังเพลง jazz', 'เดินป่า',
    'วาดรูป', 'เล่น chess', 'ดู anime', 'ทำสวน', 'เล่น piano',
    'ว่ายน้ำ', 'โยคะ', 'ทำขนม', 'ดู documentary', 'ตกปลา',
  ]
  return topics[(i - 1) % topics.length] ?? 'ตกปลา'
}

async function cleanupTestData(userId: string): Promise<void> {
  logger.info('Cleaning up test data...')

  const chatsSnapshot = await db.collection('chats').where('user_id', '==', userId).get()
  const batchDelete = db.batch()
  chatsSnapshot.docs.forEach((doc) => batchDelete.delete(doc.ref))
  await batchDelete.commit()

  await db.collection('user_memories').doc(userId).delete()

  logger.info('Cleanup completed.')
}

async function run(): Promise<void> {
  const userId = `test_summary_${Math.random().toString(36).substring(7)}`
  logger.info(`=== Summarization Memory Test ===`)
  logger.info(`Test User ID: ${userId}`)
  logger.info(`Total records: ${TOTAL_RECORDS}, Window: ${HISTORY_WINDOW}, Boundary: record #${BOUNDARY_INDEX}`)

  try {
    await seedChatHistory(userId)

    const thinkCallback = (status: TChatAgentThinkingStatus): void => {
      switch (status.status) {
        case 'thinking':
          logger.info({ message: status.message }, '🧠 Thinking...')
          break
        case 'calling_tool':
          logger.info({ toolName: status.toolName }, '🔧 Calling tool...')
          break
        case 'done':
          logger.info({ metadata: status.metadata }, '✅ Done.')
          break
      }
    }

    logger.info(`\n--- TEST 1: ถามเรื่อง record ที่ ${BOUNDARY_INDEX} (ควรอยู่ใน summary) ---`)
    const agent1 = new ChatAgent({
      userId,
      persistHistory: true,
      persistMemory: true,
      systemInstruction: 'คุณคือผู้ช่วย AI ตอบภาษาไทยกระชับตรงประเด็น',
    })

    const targetTopic = getTopicForIndex(BOUNDARY_INDEX)
    logger.info(`Record #${BOUNDARY_INDEX} ควรพูดถึง: "${targetTopic}"`)

    const result1 = await agent1.query(
      `ในการสนทนาของเรา มีครั้งไหนที่ผมพูดถึง "${targetTopic}" บ้างไหมครับ?`,
      thinkCallback,
    )

    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    logger.info(`AI Response: ${result1.response}`)
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const memoriesDoc = await db.collection('user_memories').doc(userId).get()
    if (memoriesDoc.exists) {
      const memories = memoriesDoc.data()?.memories as Record<string, string>
      logger.info('📚 user_memories snapshot:')
      logger.info({ _chat_summary_count: memories._chat_summary_count }, 'Summary count stored')
      if (memories._chat_summary) {
        logger.info(`\n[SUMMARY TEXT]\n${memories._chat_summary}\n`)
      } else {
        logger.warn('⚠️  No _chat_summary found in user_memories!')
      }
    } else {
      logger.warn('⚠️  user_memories document does not exist!')
    }

    const chatsCount = (await db.collection('chats').where('user_id', '==', userId).get()).size
    logger.info(`\n📊 Verification:`)
    logger.info(`  Total records in Firestore: ${chatsCount} (expected ${TOTAL_RECORDS * 2})`)
    logger.info(`  Summary should cover records 1-${BOUNDARY_INDEX}`)
    logger.info(`  Window covers records ${BOUNDARY_INDEX + 1}-${TOTAL_RECORDS}`)

    const responseContainsKeyword =
      result1.response.includes(targetTopic) ||
      result1.response.toLowerCase().includes('ใช่') ||
      result1.response.includes('มี') ||
      result1.response.includes('จำ')

    if (responseContainsKeyword) {
      logger.info(`\n✅ PASS: Agent รู้เรื่อง record #${BOUNDARY_INDEX} ("${targetTopic}") จาก summary`)
    } else {
      logger.warn(`\n❌ FAIL: Agent ไม่รู้เรื่อง record #${BOUNDARY_INDEX} — summary อาจยังไม่ถูกสร้าง หรือ threshold ยังไม่ถึง`)
    }

    logger.info(`\n--- TEST 2: ถามเรื่อง record ล่าสุด (ควรอยู่ใน window) ---`)
    const lastTopic = getTopicForIndex(TOTAL_RECORDS)
    const result2 = await agent1.query(
      `ล่าสุดที่ผมพูดถึง "${lastTopic}" ผมพูดว่าอะไรครับ?`,
      thinkCallback,
    )
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    logger.info(`AI Response: ${result2.response}`)
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    const recentCorrect = result2.response.includes(lastTopic) || result2.response.includes('ชอบ')
    if (recentCorrect) {
      logger.info(`✅ PASS: Agent รู้เรื่อง record ล่าสุด #${TOTAL_RECORDS} ("${lastTopic}") จาก window`)
    } else {
      logger.warn(`⚠️  Agent อาจตอบไม่ตรงเรื่อง record #${TOTAL_RECORDS}`)
    }
  } catch (error) {
    logger.error(error, 'Test failed with error')
  } finally {
    await cleanupTestData(userId)
  }

  logger.info('=== Test complete ===')
  process.exit(0)
}

run().catch((error: Error): void => {
  logger.error(error)
  process.exit(1)
})
