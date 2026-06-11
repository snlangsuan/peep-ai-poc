import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'

const SCHEDULE_LOCK_COLLECTION = 'schedule_locks'

/**
 * Atomically claims a single run slot for a scheduled job. Returns `true` to the FIRST caller
 * for a given `(jobName, slot)`; every other caller — another process, another replica, or a
 * duplicate cron fire within the same slot — gets `false` and must skip its work.
 *
 * `slot` identifies the run window and MUST be the same string for every instance that should
 * collapse into one run, e.g.:
 *   - daily job   → the local date `'2026-06-11'`
 *   - 2-hourly job → the local date+hour `'2026-06-11-18'`
 *
 * This guards daily/periodic jobs with user-visible side effects (notifications, mood cards,
 * billed LLM calls) from running more than once when the schedule worker happens to run in
 * more than one process/replica.
 *
 * On a transaction error we fail CLOSED (return `false`) so the worst case is a missed run
 * rather than duplicate messages — the very thing this lock exists to prevent.
 */
export async function acquireRunLock(jobName: string, slot: string): Promise<boolean> {
  const lockRef = db.collection(SCHEDULE_LOCK_COLLECTION).doc(`${jobName}_${slot}`)
  try {
    return await db.runTransaction(async (tx) => {
      const existing = await tx.get(lockRef)
      if (existing.exists) return false
      tx.set(lockRef, { job: jobName, slot, acquired_at: new Date() })
      return true
    })
  } catch (error) {
    logger.error({ error, jobName, slot }, '[schedule-lock] failed to acquire run lock — skipping run')
    return false
  }
}
