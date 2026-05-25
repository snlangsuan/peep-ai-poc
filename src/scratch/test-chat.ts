import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { ChatAgent } from '#/core/chat/chat-agent'
import { LoggingTask } from '#/core/chat/tasks/logging.task'
import { SentimentTask } from '#/core/chat/tasks/sentiment.task'

import type { TChatAgentThinkingStatus } from '#/core/chat/chat.type'

async function run(): Promise<void> {
  logger.info('Starting ChatAgent memory learning and persistence tests...')

  const userId: string = `test_user_${Math.random().toString(36).substring(7)}`

  logger.info(`Initialized test user ID: ${userId}`)

  const agent1 = new ChatAgent({
    userId,
    tokensPerCredit: 100,
    systemInstruction:
      'คุณคือผู้ช่วย AI แสนอบอุ่นและสุภาพ ตอบด้วยภาษาไทยอย่างเป็นธรรมชาติ และอย่าเขียนคำอธิบายเพิ่มเติมมากเกินไป',
  })

  agent1.addTask(new LoggingTask())
  agent1.addTask(new SentimentTask())

  const thinkCallback = (status: TChatAgentThinkingStatus): void => {
    switch (status.status) {
      case 'thinking':
        logger.info('ChatAgent is thinking...')
        break
      case 'calling_tool':
        logger.info({ toolName: status.toolName, args: status.args }, 'ChatAgent is executing a tool...')
        break
      case 'tool_response':
        logger.info({ toolName: status.toolName, result: status.result }, 'Tool response received...')
        break
      case 'done':
        logger.info({ metadata: status.metadata }, 'ChatAgent completed generation.')
        break
    }
  }

  try {
    logger.info('--- TEST 1: Introduce name and preference to trigger remember_user_fact tool ---')
    const result1 = await agent1.query(
      'สวัสดีครับ ผมชื่อสมชาย และผมชอบทานกะเพราเนื้อไข่ดาวมากๆ เลยครับ ช่วยจำไว้หน่อยนะ',
      thinkCallback,
    )
    console.log('AI Response 1:', result1.response)
    console.log('Metadata 1:', result1.metadata)

    logger.info('--- TEST 2: Re-instantiate agent to test persistent recall of history and memories ---')
    const agent2 = new ChatAgent({
      userId,
      tokensPerCredit: 100,
      systemInstruction:
        'คุณคือผู้ช่วย AI แสนอบอุ่นและสุภาพ ตอบด้วยภาษาไทยอย่างเป็นธรรมชาติ และอย่าเขียนคำอธิบายเพิ่มเติมมากเกินไป',
    })

    agent2.addTask(new LoggingTask())
    agent2.addTask(new SentimentTask())

    const result2 = await agent2.query('สวัสดีครับ จำได้ไหมว่าผมชื่ออะไรและชอบทานเมนูไหนเป็นพิเศษครับ', thinkCallback)
    console.log('AI Response 2:', result2.response)
    console.log('Metadata 2:', result2.metadata)

    logger.info('Cleaning up Firestore collections for test user...')

    const chatsSnapshot = await db.collection('chats').where('user_id', '==', userId).get()
    const deleteChatPromises = chatsSnapshot.docs.map((doc: any): Promise<void> => doc.ref.delete())
    await Promise.all(deleteChatPromises)

    await db.collection('user_memories').doc(userId).delete()

    logger.info('Cleanup completed successfully.')
  } catch (error) {
    logger.error(error, 'Error during execution of chat agent tests')
  }

  logger.info('ChatAgent tests finished.')
  process.exit(0)
}

run().catch((error: Error): void => {
  logger.error(error)
  process.exit(1)
})
