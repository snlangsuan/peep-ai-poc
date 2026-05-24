import { rtdb } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'

export type TQueueJob<T = unknown> = {
  id: string
  type: string
  payload: T
  status: 'pending' | 'processing' | 'completed' | 'failed'
  timestamp: number
}

export class FirebaseQueueService {
  private processors: Map<string, (payload: any) => Promise<void>> = new Map()
  private activeListeners: Set<string> = new Set()

  private activeJobsCount: Map<string, number> = new Map()
  private pendingJobsQueue: Map<string, string[]> = new Map()
  private concurrencyLimits: Map<string, number> = new Map()

  constructor() {
    logger.info('FirebaseQueueService instantiated')
  }

  /**
   * Add a job to the queue
   */
  async add<T>(type: string, payload: T): Promise<string> {
    const queueRef = rtdb.ref(`queues/${type}/jobs`)
    const jobRef = queueRef.push()

    const job: TQueueJob<T> = {
      id: jobRef.key || Math.random().toString(36).substring(7),
      type,
      payload,
      status: 'pending',
      timestamp: Date.now(),
    }

    await jobRef.set(job)
    logger.info({ job_id: job.id, type: job.type }, 'Job added to Firebase queue')

    return job.id
  }

  /**
   * Register a processor for a specific job type with a concurrency limit (defaults to 3)
   */
  registerProcessor(type: string, processor: (payload: any) => Promise<void>, concurrencyLimit: number = 3): void {
    logger.info({ type, concurrencyLimit }, 'Registering processor for job type with concurrency limit')
    this.processors.set(type, processor)
    this.concurrencyLimits.set(type, concurrencyLimit)
    this.listenToQueue(type)
  }

  /**
   * Listen to the queue for new jobs
   */
  private listenToQueue(type: string) {
    if (this.activeListeners.has(type)) return
    this.activeListeners.add(type)

    const queueRef = rtdb.ref(`queues/${type}/jobs`)

    // Listen for new jobs added to the queue
    queueRef.on('child_added', (snapshot) => {
      const jobId = snapshot.key
      if (!jobId) return

      // Add to pending jobs queue and trigger next processing check
      const queue = this.pendingJobsQueue.get(type) || []
      queue.push(jobId)
      this.pendingJobsQueue.set(type, queue)

      this.processNext(type)
    })
  }

  /**
   * Process the next job in the queue if under the concurrency limit
   */
  private async processNext(type: string) {
    const limit = this.concurrencyLimits.get(type) ?? Infinity
    const activeCount = this.activeJobsCount.get(type) ?? 0

    if (activeCount >= limit) {
      return // At concurrency limit, do nothing and wait
    }

    const queue = this.pendingJobsQueue.get(type) || []
    if (queue.length === 0) {
      return // No jobs in local queue
    }

    const jobId = queue.shift()!
    this.pendingJobsQueue.set(type, queue)

    // Increment active count
    this.activeJobsCount.set(type, activeCount + 1)

    // Process job asynchronously in the background
    this.claimAndProcess(type, jobId).finally(() => {
      // Decrement active count
      const currentActive = this.activeJobsCount.get(type) ?? 1
      this.activeJobsCount.set(type, Math.max(0, currentActive - 1))
      // Trigger checking next job
      this.processNext(type)
    })

    // Try starting the next one in case we are still under the concurrency limit
    this.processNext(type)
  }

  /**
   * Try to claim a job and process it if successful
   */
  private async claimAndProcess(type: string, jobId: string) {
    const jobRef = rtdb.ref(`queues/${type}/jobs/${jobId}`)

    try {
      // Use transaction to ensure only one worker processes this job
      const result = await jobRef.transaction((currentData) => {
        if (currentData === null) return undefined // Already deleted
        if (currentData.status !== 'pending') return undefined // Already being processed

        return {
          ...currentData,
          status: 'processing',
          claimed_at: Date.now(),
        }
      })

      if (!result.committed) {
        // Someone else claimed it first
        return
      }

      const job = result.snapshot.val() as TQueueJob<any>
      const processor = this.processors.get(type)

      if (processor) {
        logger.info({ job_id: jobId, type }, 'Processing job from Firebase queue')
        await processor(job.payload)

        // Mark as completed and delete (or keep for history)
        await jobRef.remove()
        logger.info({ job_id: jobId }, 'Job completed and removed from queue')
      }
    } catch (error) {
      logger.error({ job_id: jobId, error }, 'Error processing job from Firebase queue')
      await jobRef.update({ status: 'failed', error: String(error) })
    }
  }
}

// Export a singleton instance
export const memoryQueueService = new FirebaseQueueService()
