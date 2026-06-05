import { memoryQueueService } from '#/common/services/queue.service'

import type { ChatRepository } from '#/features/chats/v1/chat.repository'
import type { TChatRawResponse, TChatCreatePayload } from '#/features/chats/v1/chat.type'

export class ChatService {
  constructor(private readonly repository: ChatRepository) {}

  async send(userId: string, content: TChatCreatePayload['content']): Promise<string> {
    return memoryQueueService.add('chat_message', {
      userId,
      content,
    })
  }

  async list(userId: string, limit: number = 20, sessionId?: string): Promise<TChatRawResponse[]> {
    return this.repository.list(userId, limit, sessionId)
  }
}
