import type { Content, Part } from '@google/genai'

export type TChatMessageItem =
  | { type: 'text'; text: string }
  | { type: 'image'; image_url: string }
  | { type: 'file'; file_name: string; file_url: string }
  | { type: 'link'; link: string; title?: string }

export interface IChatIntent {
  type: 'direct_tool' | 'general_chat' | 'complex_agent'
  toolName?: string
  args?: Record<string, unknown>
}

export interface IChatContext {
  userId: string
  message: string
  history: Content[]
  metadata: Record<string, unknown>
}

export interface IChatTask {
  name: string
  execute(context: IChatContext): Promise<void>
}

export interface IChatTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, context: IChatContext): Promise<string>
  creditCost?: number
}

export interface IChatAgentMetadata {
  totalInputTokens: number
  totalOutputTokens: number
  grandTotalTokens: number
  toolUsageCount: number
  totalCreditsUsed: number
}

export interface IChatAgentResult {
  response: string
  metadata: IChatAgentMetadata
}

export interface IChatAgentOptions {
  userId: string
  history?: Content[]
  systemInstruction?: string
  persistHistory?: boolean
  persistMemory?: boolean
  tokensPerCredit?: number
  provider?: 'gemini' | 'openai'
  disableClassifier?: boolean
}

export type TChatAgentThinkingStatus =
  | { status: 'thinking'; message?: string }
  | { status: 'calling_tool'; toolName: string; args: Record<string, unknown> }
  | { status: 'tool_response'; toolName: string; result: unknown }
  | { status: 'done'; response: string; metadata: IChatAgentMetadata }

export type TThinkCallback = (status: TChatAgentThinkingStatus) => void | Promise<void>
