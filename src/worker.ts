import { logger } from '#/common/libs/logger.lib'
import { memoryQueueService } from '#/common/services/queue.service'
import { sseBroker } from '#/common/services/sse-broker.service'
import { ChatAgent, ChatAgentError } from '#/core/chat/chat-agent'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { getCurrentSessionId } from '#/features/chats/v1/chat-session.helper'
import {
  createWebSearchSkill,
  createScheduleManagementSkill,
  createTodoManagementSkill,
  createExpenseManagementSkill,
  createAccountManagementSkill,
  createFortuneTellingSkill,
  createMoodManagementSkill,
  createSummarySkill,
} from '#/core/chat/skills'
import { CheckSchedulesModule } from '#/worker/schedule/modules/check-schedules.module'
import { CleanupImagesModule } from '#/worker/schedule/modules/cleanup-images.module'
import { ExtractMemoriesModule } from '#/worker/schedule/modules/extract-memories.module'
import { GenerateHoroscopeModule } from '#/worker/schedule/modules/generate-horoscope.module'
import { SendMoodToAllModule } from '#/worker/schedule/modules/send-mood.module'
import { SendDailyBriefingModule } from '#/worker/schedule/modules/send-daily-briefing.module'
import { ScheduleWorker } from '#/worker/schedule/schedule-worker'

import type { TChatAgentThinkingStatus } from '#/core/chat/chat.type'


let scheduleWorker: ScheduleWorker | null = null

function handleAgentEvent(userId: string, response: TChatAgentThinkingStatus): void {
  if (response.status === 'user_message') {
    logger.info({ userId, messageId: response.savedMessage.id }, '[chat-agent] user message saved')
    sseBroker.emit(userId, {
      type: 'user_message',
      message: mapRawChatToResponse(response.savedMessage),
    })
  } else if (response.status === 'thinking') {
    logger.info({ userId, message: response.message }, '[chat-agent] thinking')
    sseBroker.emit(userId, { type: 'thinking', message: response.message })
  } else if (response.status === 'calling_tool') {
    logger.info({ userId, tool: response.toolName, args: response.args }, '[chat-agent] calling tool')
    sseBroker.emit(userId, {
      type: 'calling_tool',
      tool_name: response.toolName,
      args: response.args,
    })
  } else if (response.status === 'tool_response') {
    const resultStr = typeof response.result === 'string' ? response.result : JSON.stringify(response.result)
    logger.info(
      { userId, tool: response.toolName, result: resultStr.slice(0, 500) },
      '[chat-agent] tool responded',
    )
  } else if (response.status === 'done') {
    const message = response.savedMessage ? mapRawChatToResponse(response.savedMessage) : undefined
    logger.info(
      {
        userId,
        messageId: response.messageId,
        response: response.response.slice(0, 200),
        inputTokens: response.metadata.totalInputTokens,
        outputTokens: response.metadata.totalOutputTokens,
        totalTokens: response.metadata.grandTotalTokens,
        toolUsageCount: response.metadata.toolUsageCount,
        creditsUsed: response.metadata.totalCreditsUsed,
        remainingCredits: response.metadata.remainingCredits,
      },
      '[chat-agent] done',
    )
    if (message) {
      sseBroker.emit(userId, { type: 'done', message })
    }
  }
}

export function startQueueWorker() {
  logger.info('🚀 Starting background queue worker...')

  memoryQueueService.registerProcessor(
    'test_queue',
    async (payload) => {
      const jobIndex = payload?.meta?.index || 'unknown'
      logger.info(`📦 Starting processing job ${jobIndex} (takes 3s)...`)
      await new Promise((resolve) => setTimeout(resolve, 3000))
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log(`📥 [QUEUE WORKER] Finished job ${jobIndex}:`)
      console.log(JSON.stringify(payload, null, 2))
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    },
    3,
  )

  memoryQueueService.registerProcessor(
    'chat_message',
    async (payload) => {
      const { userId, content } = payload

      const contentSummary = content.map((c: { type: string; text?: string; file_name?: string; link?: string }) => {
        if (c.type === 'text') return { type: 'text', text: (c.text || '').slice(0, 200) }
        if (c.type === 'image') return { type: 'image' }
        if (c.type === 'file') return { type: 'file', file_name: c.file_name }
        if (c.type === 'link') return { type: 'link', link: c.link }
        return c
      })
      logger.info({ userId, content: contentSummary }, '[chat-agent] received message')

      const sessionId = await getCurrentSessionId(userId)

      const agent = new ChatAgent({
        userId,
        sessionId,
        persistHistory: true,
        persistMemory: true,
        // persona: DEFAULT_PERSONA,           // ← เลือก persona ที่นี่ในอนาคต
        // systemInstruction: AGENT_SYSTEM_INSTRUCTION, // ← override กฎการทำงานที่นี่
      })
        .addSkill(createWebSearchSkill())
        .addSkill(createScheduleManagementSkill())
        .addSkill(createTodoManagementSkill())
        .addSkill(createExpenseManagementSkill())
        .addSkill(createAccountManagementSkill())
        .addSkill(createFortuneTellingSkill())
        .addSkill(createMoodManagementSkill())
        .addSkill(createSummarySkill())

      let lastUserMessageId: string | undefined
      try {
        await agent.query(content, async (response) => {
          if (response.status === 'user_message') {
            lastUserMessageId = response.savedMessage.id
          }
          handleAgentEvent(userId, response)
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        const stage = err instanceof ChatAgentError ? err.stage : 'unknown'
        const code = err instanceof ChatAgentError ? err.code : undefined
        logger.error({ userId, messageId: lastUserMessageId, stage, code, err }, '[chat-agent] failed')

        if (lastUserMessageId) {
          await agent.markUserMessageAsFailed(lastUserMessageId, errorMessage, { stage, code })
        }
        const savedBotError = await agent.saveBotErrorMessage(errorMessage, { stage, code })

        sseBroker.emit(userId, {
          type: 'error',
          message: errorMessage,
          message_id: lastUserMessageId,
          stage,
          ...(code ? { code } : {}),
          ...(savedBotError ? { bot_message_id: savedBotError.id } : {}),
        })
      }
    },
    3,
  )

  logger.info('✅ Queue worker is active and listening to Firebase Realtime Database.')
}

export function startScheduleWorker() {
  logger.info('⏰ Starting background schedule worker coordinator...')

  if (scheduleWorker) {
    scheduleWorker.stop()
  }

  scheduleWorker = new ScheduleWorker()
  scheduleWorker
    .addModule(new CheckSchedulesModule())
    .addModule(new CleanupImagesModule())
    .addModule(new SendMoodToAllModule())
    .addModule(new SendDailyBriefingModule())
    .addModule(new ExtractMemoriesModule())
    .addModule(new GenerateHoroscopeModule())

  scheduleWorker.start()
}

export function stopAllWorkers() {
  logger.info('Stopping all background workers...')
  if (scheduleWorker) {
    scheduleWorker.stop()
    scheduleWorker = null
  }
}

if (import.meta.main) {
  startQueueWorker()
  startScheduleWorker()

  const shutdown = () => {
    stopAllWorkers()
    logger.info('Workers stopped. Exiting process.')
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
