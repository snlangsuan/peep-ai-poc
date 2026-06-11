import { GoogleGenAI, type GenerateContentResponse, type Content, type Tool } from '@google/genai'

import { logger } from '#/common/libs/logger.lib'
import { extractGeminiUsage, logLlmUsage, type ILlmUsageMeta } from '#/common/services/usage-logger.service'
import { envVariables } from '#/factory'

export class AIService {
  private client: GoogleGenAI

  constructor() {
    this.client = new GoogleGenAI({
      enterprise: true,
      project: envVariables.GOOGLE_PROJECT_ID,
      location: envVariables.GOOGLE_LOCATION,
      googleAuthOptions: {
        credentials: {
          client_email: envVariables.GOOGLE_AUTH_CLIENT_EMAIL,
          private_key: envVariables.GOOGLE_AUTH_PRIVATE_KEY.replace(/\\n/g, '\n'),
        },
      },
    })
  }

  async generate(
    contents: Content[],
    options?: {
      model?: string
      systemInstruction?: string
      tools?: Tool[]
      temperature?: number
      responseMimeType?: string
      thinkingBudget?: number
      /**
       * When provided, token usage for this call is recorded in the central
       * `llm_usage_log` ledger. Omit for chat-reply calls — those persist usage
       * on the chat document instead (see usage-logger.service.ts).
       */
      meta?: ILlmUsageMeta
    },
  ): Promise<GenerateContentResponse> {
    try {
      const modelName = options?.model || envVariables.GOOGLE_GEMINI_CHAT_MODEL

      const response = await this.client.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction: options?.systemInstruction,
          tools: options?.tools,
          temperature: options?.temperature ?? 0.7,
          responseMimeType: options?.responseMimeType,
          // Disable Gemini "thinking" mode by default to reduce latency.
          // Callers can re-enable by passing a positive thinkingBudget.
          thinkingConfig: { thinkingBudget: options?.thinkingBudget ?? 0 },
        },
      })

      if (options?.meta) {
        await logLlmUsage({ meta: options.meta, model: modelName, usage: extractGeminiUsage(response) })
      }

      return response
    } catch (error) {
      logger.error({ error, contents }, 'AIService.generate failed')
      throw error
    }
  }

  /**
   * Chatbot Model: Optimized for conversation and tool usage
   */
  async chatbot(history: Content[], systemInstruction: string, tools?: Tool[]): Promise<GenerateContentResponse> {
    return this.generate(history, {
      model: envVariables.GOOGLE_GEMINI_CHAT_MODEL,
      systemInstruction,
      tools,
      temperature: 0.7,
    })
  }

  /**
   * Summary Model: Focused on analyzing and synthesizing data
   */
  async summarize(text: string, context?: string): Promise<string> {
    const systemInstruction = context
      ? `Context: ${context}\nSummarize the following information clearly and concisely.`
      : 'Summarize the following information clearly and concisely.'
    const response = await this.generate([{ role: 'user', parts: [{ text }] }], {
      model: envVariables.GOOGLE_GEMINI_CHAT_MODEL,
      systemInstruction,
      temperature: 0.3,
    })
    return response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || ''
  }

  /**
   * Extractor Model: Specialized in structured data extraction
   */
  async extract(text: string, options: { targetInfo?: string; prompt?: string; json?: boolean }): Promise<string> {
    const systemInstruction = options.targetInfo
      ? `Extract the following information from the text: ${options.targetInfo}. Respond ONLY with the requested data, preferably in a structured format.`
      : undefined

    const promptText = options.prompt || text

    const response = await this.generate([{ role: 'user', parts: [{ text: promptText }] }], {
      model: envVariables.GOOGLE_GEMINI_EXTRACT_MODEL,
      systemInstruction,
      temperature: 0.1,
      responseMimeType: options.json ? 'application/json' : undefined,
    })
    return response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || ''
  }

  /**
   * Simple Ask: Quick queries
   */
  async ask(prompt: string, systemInstruction?: string): Promise<string> {
    const response = await this.generate([{ role: 'user', parts: [{ text: prompt }] }], { systemInstruction })
    return response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || ''
  }
}
