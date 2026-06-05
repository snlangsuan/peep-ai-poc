import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { AIService } from '#/common/services/ai.service'
import { getUtcTime } from '#/common/utils/datetime.util'
import { envVariables } from '#/factory'

import type { IScheduleModule } from '#/worker/schedule/schedule.type'

/** Memory keys that are bookkeeping, not user facts (must be ignored/never shown). */
const INTERNAL_MEMORY_KEY_PREFIX = '_'

const EXTRACTION_INSTRUCTION = `You extract ONLY genuinely meaningful, long-lasting facts about the user that help personalize future conversations. Be highly selective and conservative: most messages contain NOTHING worth saving — when in doubt, save nothing.

You are given a batch of the user's recent messages. Extract facts that are consistent and durable across them.

Return STRICT JSON only, no prose, no code fences: {"facts":[{"key":"...","value":"..."}]}
- key: concise snake_case category in English.
- value: short factual description, in the user's own language.

SAVE only these kinds of things:
- Preferences / likes & dislikes (e.g. ชอบกาแฟดำ, ไม่ชอบอาหารเผ็ด, ชอบคำตอบสั้น ๆ) → keys like preference, likes, dislikes.
- Recurring activities / habits the user does often (e.g. วิ่งทุกเช้า, ประชุมทีมทุกวันจันทร์, ดูหนังวันหยุด) → keys like routine, habit, frequent_activity.
- Stable constraints that affect how to help them (e.g. แพ้ถั่ว, ทำงานกะดึก, มีงบรายเดือนจำกัด) → keys like allergy, constraint, health.
- Core identity the user states about themselves (name/nickname, job, family) — only if clearly stated as a lasting fact.

DO NOT save:
- One-off events or task data (a single meeting, a single expense, today's todo, today's mood).
- Transient states or requests/commands (e.g. "ขอดูค่าใช้จ่ายวันนี้", "วันนี้เหนื่อย").
- Neutral/trivial facts, smalltalk, greetings, questions, opinions about other people.
- Anything already covered by EXISTING MEMORIES (no duplicates, no restating).

If nothing clearly qualifies, return {"facts":[]}.`

/**
 * Periodically scans each user's recent messages and distills durable long-term
 * facts (preferences, recurring activities, constraints) into
 * `user_memories.memories`. Runs as a batch job — NOT on every chat turn — so it
 * never adds latency to replies. Memories persist across "/clear".
 */
export class ExtractMemoriesModule implements IScheduleModule {
  readonly name = 'extract-user-memories'
  readonly cronPattern = '0 */2 * * *' // every 2 hours
  readonly timezone = 'Asia/Bangkok'

  async execute(): Promise<void> {
    logger.info('🧠 [ExtractMemoriesModule] scanning recent user messages for long-term memories...')
    const usersSnap = await db.collection('users').get()
    let usersWithNewMemories = 0
    for (const userDoc of usersSnap.docs) {
      try {
        const saved = await extractRecentUserMemories(userDoc.id)
        if (saved > 0) usersWithNewMemories += 1
      } catch (error) {
        logger.warn({ error, userId: userDoc.id }, '[extract-memories] failed for user')
      }
    }
    logger.info({ totalUsers: usersSnap.size, usersWithNewMemories }, '✅ [ExtractMemoriesModule] done')
  }
}

async function extractRecentUserMemories(userId: string): Promise<number> {
  const memDocRef = db.collection('user_memories').doc(userId)
  const memDoc = await memDocRef.get()
  const memData = memDoc.exists ? memDoc.data() : undefined

  // Watermark: only consider messages created after the last extraction.
  const watermarkIso = (memData?.memory_extracted_at as string) || ''
  const watermark = watermarkIso ? new Date(watermarkIso).getTime() : 0

  const chatsSnap = await db.collection('chats').where('user_id', '==', userId).get()
  const messages = chatsSnap.docs
    .map((d) => d.data())
    // Only the user's own messages (bot messages use sender_id 'bot').
    .filter((d) => d.sender_id === userId)
    .map((d) => ({ text: contentToText(d.content), ts: d.created_at?.toDate?.()?.getTime() || 0 }))
    .filter((m) => m.text.length > 0 && m.ts > watermark)
    .sort((a, b) => a.ts - b.ts)

  const now = getUtcTime().toDate()

  if (messages.length === 0) {
    // Nothing new — advance the watermark so we don't rescan this window again.
    await memDocRef.set({ userId, memory_extracted_at: now.toISOString() }, { merge: true })
    return 0
  }

  const latestTs = messages[messages.length - 1]!.ts
  const existing = (memData?.memories || {}) as Record<string, string>
  const existingForPrompt = Object.fromEntries(
    Object.entries(existing).filter(([k]) => !k.startsWith(INTERNAL_MEMORY_KEY_PREFIX)),
  )

  const conversationText = messages.map((m, i) => `${i + 1}. ${m.text}`).join('\n')
  const ai = new AIService()
  const prompt = `EXISTING MEMORIES (do not duplicate or restate):\n${JSON.stringify(existingForPrompt)}\n\nRECENT USER MESSAGES:\n${conversationText}`
  const response = await ai.generate([{ role: 'user', parts: [{ text: prompt }] }], {
    model: envVariables.GOOGLE_GEMINI_EXTRACT_MODEL,
    systemInstruction: EXTRACTION_INSTRUCTION,
    temperature: 0,
    responseMimeType: 'application/json',
  })
  const text = response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || ''
  const facts = parseFacts(text)

  await db.runTransaction(async (tx) => {
    const doc = await tx.get(memDocRef)
    const memories = doc.exists ? ((doc.data()?.memories || {}) as Record<string, string>) : {}
    for (const fact of facts) {
      memories[fact.key] = fact.value
    }
    tx.set(
      memDocRef,
      { userId, memories, memory_extracted_at: new Date(latestTs).toISOString(), updatedAt: now },
      { merge: true },
    )
  })

  if (facts.length > 0) {
    logger.info(
      { userId, count: facts.length, keys: facts.map((f) => f.key) },
      '[extract-memories] saved long-term user memories',
    )
  }
  return facts.length
}

function contentToText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const item of content as Array<Record<string, unknown>>) {
    if (item?.type === 'text' && typeof item.text === 'string') parts.push(item.text)
  }
  return parts.join(' ').trim()
}

function parseFacts(text: string): Array<{ key: string; value: string }> {
  if (!text) return []
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned) as { facts?: Array<{ key?: unknown; value?: unknown }> }
    const facts = Array.isArray(parsed?.facts) ? parsed.facts : []
    return facts
      .filter(
        (f): f is { key: string; value: string } =>
          !!f &&
          typeof f.key === 'string' &&
          typeof f.value === 'string' &&
          f.key.trim().length > 0 &&
          f.value.trim().length > 0 &&
          !f.key.trim().startsWith(INTERNAL_MEMORY_KEY_PREFIX),
      )
      .slice(0, 10)
      .map((f) => ({ key: f.key.trim().slice(0, 60), value: f.value.trim().slice(0, 300) }))
  } catch {
    return []
  }
}
