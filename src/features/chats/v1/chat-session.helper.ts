import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

/** Field on the `users` doc that holds the user's active chat session id. */
const SESSION_FIELD = 'current_chat_session_id'

/**
 * Returns the user's current chat session id, creating one on first access.
 * On first creation, legacy chat docs (without a `session_id`) are backfilled
 * into this initial session so existing history stays grouped and visible.
 */
export async function getCurrentSessionId(userId: string): Promise<string> {
  const userRef = db.collection('users').doc(userId)

  const { sessionId, created } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    const existing = snap.exists ? (snap.data()?.[SESSION_FIELD] as string | undefined) : undefined
    if (existing) return { sessionId: existing, created: false }
    const newId = getUUID()
    tx.set(userRef, { [SESSION_FIELD]: newId }, { merge: true })
    return { sessionId: newId, created: true }
  })

  if (created) {
    await backfillLegacyChats(userId, sessionId)
  }
  return sessionId
}

/**
 * Starts a brand-new chat session for the user (used by the "/clear" command).
 * Also resets the cached conversation summary so the new session starts fresh.
 */
export async function startNewSession(userId: string): Promise<string> {
  const newId = getUUID()
  await db.collection('users').doc(userId).set({ [SESSION_FIELD]: newId }, { merge: true })
  await resetChatSummary(userId)
  logger.info({ userId, sessionId: newId }, '[chat-session] started new session')
  return newId
}

async function backfillLegacyChats(userId: string, sessionId: string): Promise<void> {
  try {
    const snapshot = await db.collection('chats').where('user_id', '==', userId).get()
    const legacy = snapshot.docs.filter((d) => !d.data().session_id)
    if (legacy.length === 0) return

    // Firestore batches are capped at 500 ops; chunk to stay safely under it.
    for (let i = 0; i < legacy.length; i += 450) {
      const batch = db.batch()
      for (const doc of legacy.slice(i, i + 450)) {
        batch.update(doc.ref, { session_id: sessionId })
      }
      await batch.commit()
    }
    logger.info(
      { userId, sessionId, count: legacy.length },
      '[chat-session] backfilled legacy chats into initial session',
    )
  } catch (error) {
    logger.error({ error, userId }, '[chat-session] failed to backfill legacy chats')
  }
}

/**
 * Clears the cached conversation summary in user_memories. The chat-history
 * summary is per-session, so a new session must not inherit the old summary.
 */
async function resetChatSummary(userId: string): Promise<void> {
  try {
    const docRef = db.collection('user_memories').doc(userId)
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(docRef)
      if (!doc.exists) return
      const memories = (doc.data()?.memories || {}) as Record<string, string>
      tx.set(
        docRef,
        {
          memories: { ...memories, _chat_summary: '', _chat_summary_count: '0' },
          updatedAt: getUtcTime().toDate(),
        },
        { merge: true },
      )
    })
  } catch (error) {
    logger.error({ error, userId }, '[chat-session] failed to reset chat summary')
  }
}
