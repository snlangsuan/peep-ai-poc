import { logger } from '#/common/libs/logger.lib'
import { rtdb } from '#/common/libs/firebase.lib'

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
   * Register a processor for a specific job type
   */
  registerProcessor(type: string, processor: (payload: any) => Promise<void>): void {
    logger.info({ type }, 'Registering processor for job type')
    this.processors.set(type, processor)
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
    queueRef.on('child_added', async (snapshot) => {
      const jobId = snapshot.key
      if (!jobId) return

      await this.claimAndProcess(type, jobId)
    })
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
          claimed_at: Date.now()
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
