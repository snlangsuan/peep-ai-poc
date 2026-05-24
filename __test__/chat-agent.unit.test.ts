import { describe, expect, it, mock } from 'bun:test'
import admin from 'firebase-admin'
import { ChatAgent } from '#/core/chat/chat-agent'
import type { IChatAgentResult, IChatTool } from '#/core/chat/chat.type'
import type { GenerateContentResponse } from '@google/genai'

const mockGenerate = mock(async (): Promise<GenerateContentResponse> => {
  return {} as unknown as GenerateContentResponse
})

const mockOpenAICreate = mock(async (): Promise<any> => {
  return {}
})

mock.module('openai', () => {
  return {
    default: class {
      chat = {
        completions: {
          create: mockOpenAICreate,
        },
      }
    },
  }
})

mock.module('#/common/services/ai.service', () => {
  return {
    AIService: class {
      generate = mockGenerate
    },
  }
})

const mockDocGet = mock(async (): Promise<any> => {
  return {
    exists: false,
    data: (): any => undefined,
  }
})

const mockDocSet = mock(async (): Promise<void> => {})

const mockCollectionGet = mock(async (): Promise<any> => {
  return {
    docs: [],
  }
})

const mockCollectionAdd = mock(async (): Promise<void> => {})

const mockTransaction = {
  get: mock(async (): Promise<any> => {
    return {
      exists: false,
      data: (): any => undefined,
    }
  }),
  set: mock((): void => {}),
}

const mockRunTransaction = mock(async (cb: (txn: any) => Promise<any>): Promise<any> => {
  return cb(mockTransaction)
})

const mockDb = {
  collection: mock((name: string): any => {
    if (name !== 'chats' && name !== 'user_memories') {
      return admin.firestore().collection(name)
    }
    return {
      doc: mock((id: string): any => {
        return {
          get: mockDocGet,
          set: mockDocSet,
        }
      }),
      where: mock((field: string, op: string, val: any): any => {
        return {
          get: mockCollectionGet,
        }
      }),
      add: mockCollectionAdd,
    }
  }),
  runTransaction: mockRunTransaction,
}

mock.module('#/common/libs/firebase.lib', () => {
  return {
    db: mockDb,
  }
})

describe('ChatAgent Unit Tests', () => {
  it('should collect token counts correctly on a simple response without tools', async (): Promise<void> => {
    mockGenerate.mockClear()
    mockGenerate.mockImplementation(async (): Promise<GenerateContentResponse> => {
      return {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Hello, I am ready to help.' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 15,
          candidatesTokenCount: 25,
          totalTokenCount: 40,
        },
      } as unknown as GenerateContentResponse
    })

    const agent = new ChatAgent({ userId: 'test-user', persistHistory: false, persistMemory: false })
    const result: IChatAgentResult = await agent.query('Hi')

    expect(result.response).toBe('Hello, I am ready to help.')
    expect(result.metadata.totalInputTokens).toBe(15)
    expect(result.metadata.totalOutputTokens).toBe(25)
    expect(result.metadata.grandTotalTokens).toBe(40)
    expect(result.metadata.toolUsageCount).toBe(0)
    expect(result.metadata.totalCreditsUsed).toBe(1)
  })

  it('should accumulate tokens and tools correctly for multi-step tool calls', async (): Promise<void> => {
    mockGenerate.mockClear()

    let callCount = 0
    mockGenerate.mockImplementation(async (): Promise<GenerateContentResponse> => {
      callCount += 1
      if (callCount === 1) {
        return {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'mock_tool',
                      args: { key: 'val' },
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 20,
            candidatesTokenCount: 30,
            totalTokenCount: 50,
          },
        } as unknown as GenerateContentResponse
      } else {
        return {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [{ text: 'Tool call completed successfully.' }],
              },
            },
          ],
          usageMetadata: {
            promptTokenCount: 55,
            candidatesTokenCount: 15,
            totalTokenCount: 70,
          },
        } as unknown as GenerateContentResponse
      }
    })

    const agent = new ChatAgent({
      userId: 'test-user',
      persistHistory: false,
      persistMemory: false,
      tokensPerCredit: 100,
      disableClassifier: true,
    })
    const mockTool: IChatTool = {
      name: 'mock_tool',
      description: 'Mock tool description',
      parameters: {
        type: 'OBJECT',
        properties: {
          key: { type: 'STRING' },
        },
      },
      creditCost: 1.5,
      execute: mock(async (args: Record<string, any>): Promise<string> => {
        return 'mocked_output'
      }),
    }

    agent.addTool(mockTool)

    const result: IChatAgentResult = await agent.query('Call tool')

    expect(result.response).toBe('Tool call completed successfully.')
    expect(result.metadata.totalInputTokens).toBe(75)
    expect(result.metadata.totalOutputTokens).toBe(45)
    expect(result.metadata.grandTotalTokens).toBe(120)
    expect(result.metadata.toolUsageCount).toBe(1)
    expect(result.metadata.totalCreditsUsed).toBe(3)
    expect(mockTool.execute).toHaveBeenCalled()
  })

  it('should load short term history and save turns when persistHistory is true', async (): Promise<void> => {
    mockGenerate.mockClear()
    mockCollectionGet.mockClear()
    mockCollectionAdd.mockClear()

    mockCollectionGet.mockImplementation(async (): Promise<any> => {
      return {
        docs: [
          {
            data: (): any => ({
              sender_id: 'test-user',
              message: 'Hello agent',
              created_at: {
                toDate: (): Date => new Date(Date.now() - 10000),
              },
            }),
          },
          {
            data: (): any => ({
              sender_id: 'bot',
              message: 'Hello user',
              created_at: {
                toDate: (): Date => new Date(Date.now() - 5000),
              },
            }),
          },
        ],
      }
    })

    mockGenerate.mockImplementation(async (): Promise<GenerateContentResponse> => {
      return {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Response to new message' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      } as unknown as GenerateContentResponse
    })

    const agent = new ChatAgent({ userId: 'test-user', persistHistory: true, persistMemory: false })
    const result: IChatAgentResult = await agent.query('New message')

    expect(result.response).toBe('Response to new message')
    expect(mockCollectionGet).toHaveBeenCalled()
    expect(mockCollectionAdd).toHaveBeenCalledTimes(2)
    expect(result.metadata.totalCreditsUsed).toBe(1)
  })

  it('should load memories and update memory via tool when persistMemory is true', async (): Promise<void> => {
    mockGenerate.mockClear()
    mockDocGet.mockClear()
    mockRunTransaction.mockClear()
    mockTransaction.set.mockClear()

    mockDocGet.mockImplementation(async (): Promise<any> => {
      return {
        exists: true,
        data: (): any => ({
          memories: {
            hobby: 'gardening',
          },
        }),
      }
    })

    mockGenerate.mockImplementation(async (): Promise<GenerateContentResponse> => {
      return {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'I remembered that.' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 20,
          totalTokenCount: 30,
        },
      } as unknown as GenerateContentResponse
    })

    const agent = new ChatAgent({ userId: 'test-user', persistHistory: false, persistMemory: true })
    const result: IChatAgentResult = await agent.query('Hello')

    expect(result.response).toBe('I remembered that.')
    expect(mockDocGet).toHaveBeenCalled()
    expect(result.metadata.totalCreditsUsed).toBe(1)

    const rememberTool = (agent as any).tools.find((t: IChatTool) => t.name === 'remember_user_fact')
    expect(rememberTool).toBeDefined()

    const toolResult = await rememberTool.execute(
      { key: 'name', value: 'Somchai' },
      {
        userId: 'test-user',
        message: 'Hello',
        history: [],
        metadata: {},
      },
    )

    expect(toolResult).toContain('Successfully remembered user fact')
    expect(mockRunTransaction).toHaveBeenCalled()
    expect(mockTransaction.set).toHaveBeenCalled()
  })

  it('should query OpenAI correctly when provider is set to openai', async (): Promise<void> => {
    mockOpenAICreate.mockClear()
    mockOpenAICreate.mockImplementation(async (): Promise<any> => {
      return {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello user, this is OpenAI.',
            },
          },
        ],
        usage: {
          prompt_tokens: 22,
          completion_tokens: 33,
        },
      }
    })

    const agent = new ChatAgent({
      userId: 'test-user',
      persistHistory: false,
      persistMemory: false,
      provider: 'openai',
    })
    const result = await agent.query('Hello AI')

    expect(result.response).toBe('Hello user, this is OpenAI.')
    expect(result.metadata.totalInputTokens).toBe(22)
    expect(result.metadata.totalOutputTokens).toBe(33)
    expect(result.metadata.grandTotalTokens).toBe(55)
    expect(result.metadata.totalCreditsUsed).toBe(1)
    expect(mockOpenAICreate).toHaveBeenCalled()
  })

  it('should handle multimodal base64 image inputs correctly', async (): Promise<void> => {
    mockGenerate.mockClear()
    mockGenerate.mockImplementation(async (): Promise<GenerateContentResponse> => {
      return {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'I see a beautiful sunset in your image.' }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 150,
          candidatesTokenCount: 50,
          totalTokenCount: 200,
        },
      } as unknown as GenerateContentResponse
    })

    const agent = new ChatAgent({
      userId: 'test-user',
      persistHistory: false,
      persistMemory: false,
      disableClassifier: true,
    })

    const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA'
    const result: IChatAgentResult = await agent.query([
      { type: 'text', text: 'What do you see?' },
      { type: 'image', image_url: base64Image },
    ])

    expect(result.response).toBe('I see a beautiful sunset in your image.')
    expect(mockGenerate).toHaveBeenCalled()

    const calls = mockGenerate.mock.calls as any
    expect(calls.length).toBeGreaterThan(0)
    const lastCallArgs = calls[0]
    if (!lastCallArgs) {
      throw new Error('No mock calls recorded')
    }
    const contents = lastCallArgs[0] as unknown as any[]
    const userMessage = contents[contents.length - 1]
    const imagePart = userMessage.parts.find((p: any) => p.inlineData)
    
    expect(imagePart).toBeDefined()
    expect(imagePart.inlineData.mimeType).toBe('image/png')
    expect(imagePart.inlineData.data).toBe('iVBORw0KGgoAAAANSUhEUgAAAAUA')
  })

  it('should prevent consecutive duplicate tool calls in consecutive steps, but allow them if separated by another step', async (): Promise<void> => {
    const agent = new ChatAgent({
      userId: 'test-user',
      persistHistory: false,
      persistMemory: false,
      disableClassifier: true,
    })

    const mockTool: IChatTool = {
      name: 'test_calc',
      description: 'Calc tool',
      parameters: { type: 'OBJECT', properties: { expression: { type: 'STRING' } } },
      execute: mock(async (args: Record<string, unknown>): Promise<string> => {
        return `result of ${args.expression}`
      }),
    }
    agent.addTool(mockTool)

    // Reset loop tracking state
    ;(agent as any).clearToolExecutionTracking()

    // --- STEP 1 START ---
    ;(agent as any).startNewToolExecutionStep()

    // 1. Call test_calc with '1+2' in Step 1 -> Should be ALLOWED!
    const result1 = await (agent as any).runToolCall({ name: 'test_calc', args: { expression: '1+2' } }, {} as any)
    expect(result1.responsePayload).toBe('result of 1+2')
    expect(mockTool.execute).toHaveBeenCalledTimes(1)

    // 2. Parallel duplicate call within the same step -> Should be BLOCKED!
    const resultParallel = await (agent as any).runToolCall({ name: 'test_calc', args: { expression: '1+2' } }, {} as any)
    expect(resultParallel.responsePayload).toEqual({
      error: 'Error: Tool "test_calc" with identical arguments is already scheduled for execution in this step.'
    })
    expect(mockTool.execute).toHaveBeenCalledTimes(1)

    ;(agent as any).endToolExecutionStep()
    // --- STEP 1 END ---

    // --- STEP 2 START (Consecutive duplicate) ---
    ;(agent as any).startNewToolExecutionStep()

    // 3. Call test_calc with '1+2' in Step 2 -> Should be BLOCKED! (consecutive duplicate from Step 1)
    const result2 = await (agent as any).runToolCall({ name: 'test_calc', args: { expression: '1+2' } }, {} as any)
    expect(result2.responsePayload).toEqual({
      error: 'Error: Tool "test_calc" was already executed with the exact same arguments in the immediate previous step. Consecutive execution is blocked to prevent infinite loops.'
    })
    expect(mockTool.execute).toHaveBeenCalledTimes(1) // Still 1!

    // 4. Call test_calc with '3+4' in Step 2 -> Should be ALLOWED! (different arguments)
    const resultDifferent = await (agent as any).runToolCall({ name: 'test_calc', args: { expression: '3+4' } }, {} as any)
    expect(resultDifferent.responsePayload).toBe('result of 3+4')
    expect(mockTool.execute).toHaveBeenCalledTimes(2) // Incremented to 2!

    ;(agent as any).endToolExecutionStep()
    // --- STEP 2 END ---

    // --- STEP 3 START (Non-consecutive duplicate) ---
    ;(agent as any).startNewToolExecutionStep()

    // 5. Call test_calc with '1+2' in Step 3 -> Should be ALLOWED! (since Step 2 executed '3+4', not '1+2', it is non-consecutive!)
    const result3 = await (agent as any).runToolCall({ name: 'test_calc', args: { expression: '1+2' } }, {} as any)
    expect(result3.responsePayload).toBe('result of 1+2')
    expect(mockTool.execute).toHaveBeenCalledTimes(3) // Incremented to 3!

    ;(agent as any).endToolExecutionStep()
    // --- STEP 3 END ---
  })
})
