import type { Content, Part } from '@google/genai'

export type TChatMessageItem =
  | { type: 'text'; text: string }
  | { type: 'image'; image_url: string }
  | { type: 'file'; file_name: string; file_url: string }
  | { type: 'link'; link: string; title?: string }

export interface IChatIntent {
  type: 'direct_tool' | 'general_chat' | 'complex_agent'
  toolName?: string
}

export interface IChatContext {
  userId: string
  message: string
  history: Content[]
  metadata: Record<string, unknown>
}

export interface IChatTask {
  name: string
  skill?: string
  skillInstruction?: string
  execute(context: IChatContext): Promise<void>
}

export interface IChatTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, context: IChatContext): Promise<string>
  creditCost?: number
  /**
   * If false, the classifier will not route this tool through the `direct_tool` fast-path.
   * Set false for tools whose results require further LLM reasoning (e.g. data-fetching tools like web_search).
   * Defaults to true.
   */
  allowDirectInvoke?: boolean
}

export interface IChatAgentMetadata {
  totalInputTokens: number
  totalOutputTokens: number
  grandTotalTokens: number
  toolUsageCount: number
  totalCreditsUsed: number
  remainingCredits?: number
}

export interface ISavedBotMessage {
  id: string
  sender_id: 'bot'
  message: string
  created_at: Date
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  llm_credits?: number
  tool_credits?: number
  credits_used?: number
  tools?: Array<{ name: string; credits: number }>
}

export interface ISavedUserMessage {
  id: string
  sender_id: string
  message: string
  created_at: Date
}

export interface IChatAgentResult {
  response: string
  metadata: IChatAgentMetadata
}

export interface IChatAgentOptions {
  userId: string
  history?: Content[]
  /**
   * Persona: บุคลิก น้ำเสียง และสไตล์การตอบของ Agent
   * ถ้าไม่ระบุ จะใช้ DEFAULT_PERSONA
   */
  persona?: string
  /**
   * System Instruction: กฎการทำงานและข้อจำกัดหลักของ Agent
   * ถ้าไม่ระบุ จะใช้ AGENT_SYSTEM_INSTRUCTION
   */
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
  | { status: 'user_message'; savedMessage: ISavedUserMessage }
  | {
      status: 'done'
      response: string
      messageId?: string
      savedMessage?: ISavedBotMessage
      metadata: IChatAgentMetadata
    }

export type TThinkCallback = (status: TChatAgentThinkingStatus) => void | Promise<void>
