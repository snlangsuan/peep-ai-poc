import { logger } from '#/common/libs/logger.lib'
import { memoryQueueService } from '#/common/services/queue.service'

async function run() {
  logger.info('Adding 5 test jobs in parallel to Firebase queue...')

  const tasks = Array.from({ length: 5 }).map((_, index) => {
    return memoryQueueService.add('test_queue', {
      message: `Hello parallel job ${index + 1} from test scratch script!`,
      userId: `user_parallel_${index + 1}`,
      meta: {
        source: 'scratch_script',
        index: index + 1,
        sentAt: new Date().toISOString(),
      },
    })
  })

  const jobIds = await Promise.all(tasks)
  logger.info({ jobIds }, '5 Test jobs added successfully in parallel')
  process.exit(0)
}

run().catch((error) => {
  logger.error(error)
  process.exit(1)
})
