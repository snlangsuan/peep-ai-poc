import { CLOUDY_PERSONA } from '#/common/constants/chat.constant'
import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { AIService } from '#/common/services/ai.service'
import { sseBroker } from '#/common/services/sse-broker.service'
import { getUUID } from '#/common/utils/helper.util'
import { mapRawChatToResponse } from '#/features/chats/v1/chat.mapper'
import { envVariables } from '#/factory'

export const MOOD_OPTION_IDS = ['great', 'good', 'okay', 'low', 'bad'] as const
export type TMoodOptionId = (typeof MOOD_OPTION_IDS)[number]

export const MOOD_CARD_TITLE = 'How are you feeling right now?'

export function buildMoodOptions(sid: string): Array<{ id: TMoodOptionId; link: string }> {
  const baseUrl = envVariables.BASE_URL.replace(/\/$/, '')
  return MOOD_OPTION_IDS.map((id) => ({
    id,
    link: `${baseUrl}/poc/api/v1/chats/mood?option=${id}&sid=${sid}`,
  }))
}

export interface ICreatedMoodCard {
  id: string
  sid: string
  user_id: string
  sender_id: 'bot'
  created_at: Date
}

export async function createMoodCardChat(userId: string): Promise<ICreatedMoodCard> {
  const sid = getUUID()
  const options = buildMoodOptions(sid)
  const docRef = db.collection('chats').doc()
  const createdAt = new Date()
  const content = [
    {
      type: 'mood_card' as const,
      title: MOOD_CARD_TITLE,
      options,
    },
  ]
  await docRef.set({
    user_id: userId,
    sender_id: 'bot',
    content,
    feedback: null,
    error: null,
    mood_sid: sid,
    mood_used: false,
    created_at: createdAt,
  })

  const message = mapRawChatToResponse({
    id: docRef.id,
    user_id: userId,
    sender_id: 'bot',
    content,
    created_at: createdAt,
  })
  sseBroker.emit(userId, { type: 'bot_message', message })

  return {
    id: docRef.id,
    sid,
    user_id: userId,
    sender_id: 'bot',
    created_at: createdAt,
  }
}

const MOOD_REPLY_TASK = `Task: The user just recorded today's mood via a mood-card. React like a close friend would — match the persona above.
- great / good → ดีใจกับเพื่อนแบบใจถึงใจ ไม่หวาน ไม่เลียนแบบเด็ก
- okay → รับรู้เบาๆ เป็นเพื่อนเคียงข้าง ไม่ต้องปลอบมาก
- low / bad → เข้าใจ ไม่ตัดสิน ไม่ปลอบแบบฝืน ทำให้รู้สึกไม่เดียวดาย

Output rules:
- Thai only. No JSON / markdown / code block. Plain prose.
- Maximum 30 words. ตอบสั้น กระชับ.
- 1-2 sentences only. No preamble, no follow-up question.
- If the user provided a note, briefly acknowledge it (don't quote it verbatim).`

const MOOD_REPLY_FALLBACK: Record<TMoodOptionId, string> = {
  great: 'ดีใจด้วย ขอให้วันนี้ดียาวๆ ☁️✨',
  good: 'ดีเลย ขอให้วันนี้ราบรื่น ☁️',
  okay: 'รับรู้แล้ว คลาวดี้อยู่ข้างๆ ☁️',
  low: 'พักก่อน ไม่ต้องรีบ ☁️',
  bad: 'รับรู้แล้ว ไม่ต้องเข้มแข็งตลอดเวลา ☁️',
}

async function loadUsername(userId: string): Promise<string> {
  try {
    const doc = await db.collection('users').doc(userId).get()
    if (doc.exists) {
      const username = doc.data()?.username
      if (typeof username === 'string' && username.trim().length > 0) {
        return username.trim()
      }
    }
  } catch (error) {
    logger.warn({ error, userId }, '[mood] failed to load username, using default')
  }
  return 'ปี๊บ'
}

export async function generateMoodReply(
  userId: string,
  option: TMoodOptionId,
  note?: string | null,
): Promise<string> {
  try {
    const ai = new AIService()
    const username = await loadUsername(userId)
    const userProfile = `User Profile Information:\n- User ID: ${userId}\n- Username: ${username}\n- Always address the user as "คุณ ${username}" in Thai responses. NEVER use "[username]", "<username>", "คุณคนนี้", or any placeholder.`
    const systemInstruction = `${CLOUDY_PERSONA}\n\n${userProfile}\n\n${MOOD_REPLY_TASK}`
    const noteLine = note ? `\nUser's note: "${note}"` : ''
    const prompt = `คุณ ${username} เพิ่งบันทึกอารมณ์ของวันนี้: "${option}".${noteLine}\nกรุณาตอบกลับ user เป็นภาษาไทยสั้นๆ ไม่เกิน 60 คำ ตาม persona และกฎที่ระบุไว้ และเรียก user ว่า "คุณ ${username}" ตรงๆ.`
    const text = await ai.ask(prompt, systemInstruction)
    const trimmed = text.trim()
    return trimmed.length > 0 ? trimmed : MOOD_REPLY_FALLBACK[option]
  } catch (error) {
    logger.warn({ error, option }, '[mood] LLM reply generation failed, using fallback')
    return MOOD_REPLY_FALLBACK[option]
  }
}

export async function pushBotTextMessage(userId: string, text: string): Promise<void> {
  try {
    const docRef = db.collection('chats').doc()
    const createdAt = new Date()
    const content = [{ type: 'text' as const, text }]
    await docRef.set({
      user_id: userId,
      sender_id: 'bot',
      content,
      feedback: null,
      error: null,
      created_at: createdAt,
    })
    const message = mapRawChatToResponse({
      id: docRef.id,
      user_id: userId,
      sender_id: 'bot',
      content,
      created_at: createdAt,
    })
    sseBroker.emit(userId, { type: 'bot_message', message })
    logger.info(
      { userId, chatId: docRef.id, preview: text.slice(0, 120) },
      '[chat] pushed bot text message (firestore + SSE bot_message)',
    )
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot text message')
  }
}

const MOOD_RESULT_TITLE = "Today's mood logged"

export interface IPushBotMoodResultInput {
  emotion: TMoodOptionId
  note?: string | null
  createdAt: Date
}

export async function pushBotMoodResultMessage(
  userId: string,
  input: IPushBotMoodResultInput,
): Promise<void> {
  try {
    const aiMessage = await generateMoodReply(userId, input.emotion, input.note)
    const createdAtIso = input.createdAt.toISOString()
    const content = [
      { type: 'text' as const, text: 'Mood saved 🌤️' },
      {
        type: 'mood_result' as const,
        title: MOOD_RESULT_TITLE,
        created_at: createdAtIso,
        mood: input.emotion,
        note: input.note ?? null,
        message: aiMessage,
      },
    ]

    const docRef = db.collection('chats').doc()
    const docCreatedAt = new Date()
    await docRef.set({
      user_id: userId,
      sender_id: 'bot',
      content,
      feedback: null,
      error: null,
      created_at: docCreatedAt,
    })

    const message = mapRawChatToResponse({
      id: docRef.id,
      user_id: userId,
      sender_id: 'bot',
      content,
      created_at: docCreatedAt,
    })
    sseBroker.emit(userId, { type: 'bot_message', message })
    logger.info(
      { userId, chatId: docRef.id, emotion: input.emotion },
      '[chat] pushed bot mood_result message (firestore + SSE bot_message)',
    )
  } catch (error) {
    logger.warn({ error, userId }, '[chat] failed to push bot mood_result message')
  }
}
