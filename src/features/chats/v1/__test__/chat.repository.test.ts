import { describe, expect, it, mock, beforeEach } from 'bun:test'

import type admin from 'firebase-admin'

const mockWhereGet = mock(async (): Promise<any> => {
  return {
    docs: [],
  }
})

const mockWhere = mock((field: string, op: string, val: any): any => {
  return {
    get: mockWhereGet,
  }
})

const mockDb = {
  collection: mock((name: string): any => {
    return {
      where: mockWhere,
    }
  }),
}

mock.module('#/common/libs/firebase.lib', () => {
  return {
    db: mockDb,
  }
})

import { ChatRepository } from '#/features/chats/v1/chat.repository'

describe('ChatRepository Unit Tests', () => {
  let repository: ChatRepository

  beforeEach(() => {
    repository = new ChatRepository()
    mockWhereGet.mockClear()
    mockWhere.mockClear()
    mockDb.collection.mockClear()
  })

  it('should query Firestore chats and map all token and credit usage fields correctly', async (): Promise<void> => {
    const fakeDbDoc1: admin.firestore.DocumentData = {
      user_id: 'user-123',
      sender_id: 'user-123',
      message: 'Hello Agent!',
      created_at: {
        toDate: () => new Date('2026-05-25T10:00:00.000Z'),
      },
    }

    const fakeDbDoc2: admin.firestore.DocumentData = {
      user_id: 'user-123',
      sender_id: 'bot',
      message: 'Hello User! I am here to help.',
      created_at: {
        toDate: () => new Date('2026-05-25T10:00:02.000Z'),
      },
      input_tokens: 150,
      output_tokens: 80,
      total_tokens: 230,
      llm_credits: 0.23,
      tool_credits: 5,
      credits_used: 6,
      tools: [
        { name: 'manage_expenses', credits: 0 },
        { name: 'web_search', credits: 5 },
      ],
    }

    mockWhereGet.mockImplementation(async (): Promise<any> => {
      return {
        docs: [
          {
            id: 'chat-doc-1',
            data: (): admin.firestore.DocumentData => fakeDbDoc1,
          },
          {
            id: 'chat-doc-2',
            data: (): admin.firestore.DocumentData => fakeDbDoc2,
          },
        ],
      }
    })

    const results = await repository.list('user-123', 20)

    expect(mockDb.collection).toHaveBeenCalledWith('chats')
    expect(mockWhere).toHaveBeenCalledWith('user_id', '==', 'user-123')
    expect(mockWhereGet).toHaveBeenCalled()

    expect(results.length).toBe(2)

    // User Message
    expect(results[0]?.id).toBe('chat-doc-1')
    expect(results[0]?.user_id).toBe('user-123')
    expect(results[0]?.sender_id).toBe('user-123')
    expect(results[0]?.message).toBe('Hello Agent!')
    expect(results[0]?.input_tokens).toBeUndefined()
    expect(results[0]?.tools).toBeUndefined()

    // Bot Message with token metrics
    expect(results[1]?.id).toBe('chat-doc-2')
    expect(results[1]?.user_id).toBe('user-123')
    expect(results[1]?.sender_id).toBe('bot')
    expect(results[1]?.message).toBe('Hello User! I am here to help.')
    expect(results[1]?.input_tokens).toBe(150)
    expect(results[1]?.output_tokens).toBe(80)
    expect(results[1]?.total_tokens).toBe(230)
    expect(results[1]?.llm_credits).toBe(0.23)
    expect(results[1]?.tool_credits).toBe(5)
    expect(results[1]?.credits_used).toBe(6)
    expect(results[1]?.tools).toEqual([
      { name: 'manage_expenses', credits: 0 },
      { name: 'web_search', credits: 5 },
    ])
  })
})
