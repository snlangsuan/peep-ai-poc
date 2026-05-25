import { db } from '#/common/libs/firebase.lib'

import type { TChatRawResponse } from '#/features/chats/v1/chat.type'

export class ChatRepository {
  async list(userId: string, limit: number = 20): Promise<TChatRawResponse[]> {
    const snapshot = await db.collection('chats').where('user_id', '==', userId).get()

    const docs = snapshot.docs.sort((a, b) => {
      const t1 = a.data().created_at?.toDate?.()?.getTime() || 0
      const t2 = b.data().created_at?.toDate?.()?.getTime() || 0
      return t1 - t2
    })

    return docs.slice(-limit).map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        user_id: data.user_id || data.userId,
        sender_id: data.sender_id,
        message: data.message,
        created_at: data.created_at?.toDate?.()?.toISOString() || data.created_at,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        total_tokens: data.total_tokens,
        llm_credits: data.llm_credits,
        tool_credits: data.tool_credits,
        credits_used: data.credits_used,
        tools: data.tools,
      }
    })
  }
}
