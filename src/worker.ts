import { logger } from '#/common/libs/logger.lib'
import { memoryQueueService } from '#/common/services/queue.service'
import { sseBroker } from '#/common/services/sse-broker.service'
import { ChatAgent } from '~/src/core/chat/chat-agent'
import { WebSearchTool } from '~/src/core/chat/tools/web-search.tool'
import { ScheduleManagementTool } from '~/src/core/chat/tools/schedule-management.tool'
import { TodoManagementTool } from '~/src/core/chat/tools/todo-management.tool'
import { ExpenseManagementTool } from '~/src/core/chat/tools/expense-management.tool'
import { FortuneTellingTool } from '~/src/core/chat/tools/fortune-telling.tool'
import { MoodManagementTool } from '~/src/core/chat/tools/mood-management.tool'
import { SummaryTool } from '~/src/core/chat/tools/summary.tool'
import { CheckSchedulesModule } from '#/worker/schedule/modules/check-schedules.module'
import { SendMoodToAllModule } from '#/worker/schedule/modules/send-mood.module'
import { ScheduleWorker } from '#/worker/schedule/schedule-worker'


let scheduleWorker: ScheduleWorker | null = null

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

      const agent = new ChatAgent({
        userId,
        persistHistory: true,
        persistMemory: true,
        // persona: DEFAULT_PERSONA,           // ← เลือก persona ที่นี่ในอนาคต
        // systemInstruction: AGENT_SYSTEM_INSTRUCTION, // ← override กฎการทำงานที่นี่
      })
        .addTool(new WebSearchTool())
        .addTool(new ScheduleManagementTool())
        .addTool(new TodoManagementTool())
        .addTool(new ExpenseManagementTool())
        .addTool(new FortuneTellingTool())
        .addTool(new MoodManagementTool())
        .addTool(new SummaryTool())

      try {
        const result = await agent.query(content, async (response) => {
          if (response.status === 'thinking') {
            sseBroker.emit(userId, { type: 'thinking', message: response.message })
          } else if (response.status === 'calling_tool') {
            sseBroker.emit(userId, {
              type: 'calling_tool',
              tool_name: response.toolName,
              args: response.args,
            })
          } else if (response.status === 'tool_response') {
            sseBroker.emit(userId, {
              type: 'tool_response',
              tool_name: response.toolName,
              result: response.result,
            })
          } else if (response.status === 'done') {
            sseBroker.emit(userId, {
              type: 'done',
              response: response.response,
              metadata: {
                total_input_tokens: response.metadata.totalInputTokens,
                total_output_tokens: response.metadata.totalOutputTokens,
                grand_total_tokens: response.metadata.grandTotalTokens,
                tool_usage_count: response.metadata.toolUsageCount,
                total_credits_used: response.metadata.totalCreditsUsed,
                remaining_credits: response.metadata.remainingCredits,
              },
            })
          }
        })
      } catch (err) {
        sseBroker.emit(userId, {
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
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
  scheduleWorker.addModule(new CheckSchedulesModule()).addModule(new SendMoodToAllModule())

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
