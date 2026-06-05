import OpenAI from 'openai'

import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'
import { AIService } from '#/common/services/ai.service'
import { getLocalTime, getUtcTime } from '#/common/utils/datetime.util'
import { parseQueryInput, mapInputToOpenAIContent, mapParametersToOpenAI } from '~/src/core/chat/chat-mapper'
import { envVariables } from '#/factory'
import { AGENT_SYSTEM_INSTRUCTION, DEFAULT_PERSONA, CLASSIFIER_SYSTEM_INSTRUCTION_TEMPLATE } from '#/common/constants/chat.constant'

import type {
  IChatContext,
  IChatTask,
  IChatTool,
  IChatSkill,
  IChatAgentMetadata,
  IChatAgentResult,
  IChatAgentOptions,
  IChatIntent,
  ISavedBotMessage,
  ISavedUserMessage,
  TChatMessageItem,
  TThinkCallback,
} from '~/src/core/chat/chat.type'
import type { TChatResponse } from '#/features/chats/v1/chat.type'
import type { Content, Tool, GenerateContentResponse, Part } from '@google/genai'

// ==========================================
// Error types
// ==========================================

export type TChatAgentStage =
  | 'persist_user_message'
  | 'classify_intent'
  | 'llm_call'
  | 'tool_execute'
  | 'persist_bot_message'
  | 'unknown'

export class ChatAgentError extends Error {
  readonly stage: TChatAgentStage
  readonly code?: string
  constructor(stage: TChatAgentStage, message: string, options?: { code?: string; cause?: unknown }) {
    super(message)
    this.name = 'ChatAgentError'
    this.stage = stage
    this.code = options?.code
    if (options?.cause !== undefined) {
      ;(this as Error & { cause?: unknown }).cause = options.cause
    }
  }
}

// ==========================================
// Main ChatAgent Class
// ==========================================

export class ChatAgent {
  // Service & Client Instances
  private aiService: AIService
  private openai: OpenAI | null = null

  // Configurations
  private provider: 'gemini' | 'openai'
  private userId: string
  /** Active chat session id; stamped on persisted docs and used to scope history. */
  private sessionId: string | undefined
  private tokensPerCredit: number
  private persistHistory: boolean
  private persistMemory: boolean
  private disableClassifier: boolean
  /** Persona: บุคลิก น้ำเสียง สไตล์การตอบ — เปลี่ยนได้ตาม persona ที่เลือก */
  private persona: string
  /** System Instruction: กฎการทำงานและข้อจำกัดหลัก — คงที่เสมอไม่ว่าจะเลือก persona ใด */
  private systemInstruction: string

  // Conversational & Tool State
  private history: Content[]
  private tools: IChatTool[] = []
  private skills: IChatSkill[] = []
  private tasks: IChatTask[] = []
  private lastStepTools = new Set<string>()
  private currentStepTools = new Set<string>()
  private executedTools: Array<{ name: string; credits: number }> = []
  private usedSkills = new Set<string>()
  private remainingCredits: number | null = null
  // Set by a tool (via `__suppress_agent_response: true` in its response) to signal
  // that the tool already pushed a user-facing bot_message via SSE+Firestore,
  // so the agent should skip its own saveBotMessage + done-event emission to avoid duplication.
  private suppressFinalAgentMessage = false
  // Captured from a tool's response via `__agent_saved_message` — the chat record the tool
  // pre-saved to Firestore. The agent uses this in its `done` SSE event (with real metadata)
  // instead of generating + saving its own LLM text response.
  private pendingAgentSavedMessage: ISavedBotMessage | undefined

  private static readonly HISTORY_WINDOW = 20
  private static readonly SUMMARIZE_THRESHOLD = 40
  private static readonly RESUMMARY_BATCH = 10
  private static readonly MAX_REASONING_STEPS = 5

  constructor(options: IChatAgentOptions) {
    this.aiService = new AIService()
    this.provider = options.provider ?? envVariables.CHAT_PROVIDER ?? 'gemini'
    if (this.provider === 'openai') {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || envVariables.OPENAI_API_KEY || 'mock-key',
        baseURL: process.env.OPENAI_BASE_URL || envVariables.OPENAI_BASE_URL,
      })
    }
    this.userId = options.userId
    this.sessionId = options.sessionId
    this.history = options.history ?? []
    this.persona = options.persona ?? DEFAULT_PERSONA
    this.systemInstruction = options.systemInstruction ?? AGENT_SYSTEM_INSTRUCTION
    this.persistHistory = options.persistHistory !== false
    this.persistMemory = options.persistMemory !== false
    this.tokensPerCredit = options.tokensPerCredit ?? 1000
    this.disableClassifier = options.disableClassifier === true

    this.addTool(this.createTaskCompleteTool())
    if (this.persistMemory) {
      this.addTool(this.createRememberTool())
    }
  }

  // ==========================================
  // Public Configuration & Setup API
  // ==========================================

  setInstruction(instruction: string): this {
    this.systemInstruction = instruction
    return this
  }

  setPersona(persona: string): this {
    this.persona = persona
    return this
  }

  addTask(task: IChatTask): this {
    this.tasks.push(task)
    return this
  }

  /**
   * Low-level tool registration. Production code should use `addSkill()` instead;
   * `addTool()` is reserved for internal virtual tools (task_complete, remember_user_fact)
   * and for unit tests that exercise tool-level behavior directly.
   */
  addTool(tool: IChatTool): this {
    this.tools.push(tool)
    return this
  }

  addSkill(skill: IChatSkill): this {
    this.skills.push(skill)
    for (const tool of skill.tools) {
      tool.skillName = skill.name
      this.tools.push(tool)
    }
    return this
  }

  // ==========================================
  // Public Query Entrypoint
  // ==========================================

  async query(input: string | TChatMessageItem[], thinkCallback?: TThinkCallback): Promise<IChatAgentResult> {
    this.clearToolExecutionTracking()
    if (this.persistHistory) {
      await this.loadHistoryFromFirestore()
    }

    const { combinedMessage, parts } = parseQueryInput(input)

    if (this.persistHistory) {
      const savedUserMessage = await this.saveUserMessage(combinedMessage)
      if (savedUserMessage && thinkCallback) {
        await thinkCallback({ status: 'user_message', savedMessage: savedUserMessage })
      }
    }

    const context: IChatContext = {
      userId: this.userId,
      message: combinedMessage,
      history: this.history,
      metadata: {},
    }

    await this.executeTasks(context)

    // 1. Run intent classification
    const classification = await this.classifyIntent(combinedMessage)
    logger.info(
      {
        userId: this.userId,
        intent: classification.type,
        toolName: classification.toolName,
        provider: this.provider,
      },
      '[chat-agent] intent classified',
    )
    const baseInstruction = await this.buildBaseInstruction(context)

    // Engine-specific reasoning loop execution.
    // The bigger model handles parameter extraction, tool execution, and response synthesis.
    // For `direct_tool` classification, getOpenAIToolsConfig/getGeminiToolsConfig narrow the toolset to one.
    if (this.provider === 'openai') {
      return this.queryOpenAI(input, combinedMessage, context, classification, baseInstruction, thinkCallback)
    }

    return this.queryGemini(parts, context, classification, baseInstruction, thinkCallback)
  }

  // ==========================================
  // Intent Classification & Routing
  // ==========================================

  private async classifyIntent(message: string): Promise<IChatIntent> {
    if (this.disableClassifier) {
      return { type: 'complex_agent' }
    }
    if (this.tools.length === 0) {
      return { type: 'general_chat' }
    }

    const directInvokableNames = this.tools.filter((t) => t.allowDirectInvoke !== false).map((t) => t.name)

    const toolsDescription = this.tools
      .map((t) => {
        const directNote =
          t.allowDirectInvoke === false
            ? '\nRouting: complex_agent ONLY — this tool needs follow-up LLM reasoning over its result. Do NOT classify as direct_tool.'
            : ''
        return `Tool Name: "${t.name}"
Description: ${t.description}${directNote}
Parameters JSON Schema: ${JSON.stringify(t.parameters)}`
      })
      .join('\n\n')

    const systemInstruction = CLASSIFIER_SYSTEM_INSTRUCTION_TEMPLATE.replace('{{TOOLS_DESCRIPTION}}', toolsDescription)

    // Include the last few turns so short follow-up replies ("ใช่", "ตกลง", "เอา")
    // are not misclassified as general_chat when they answer a pending tool-confirmation.
    const recentHistory = this.history.slice(-4)
    const historyBlock = recentHistory
      .map((c) => {
        const role = c.role === 'model' ? 'Assistant' : 'User'
        const text = (c.parts?.[0]?.text || '').slice(0, 300)
        return `${role}: ${text}`
      })
      .join('\n')
    const classifierInput = historyBlock
      ? `Recent conversation context:\n${historyBlock}\n\nCurrent user message: ${message}`
      : message

    try {
      const jsonText = await this.callIntentClassifierLLM(systemInstruction, classifierInput)
      const result = JSON.parse(jsonText) as IChatIntent
      if (result.type === 'direct_tool' && result.toolName && directInvokableNames.includes(result.toolName)) {
        return { type: 'direct_tool', toolName: result.toolName }
      }
      if (result.type === 'general_chat' || result.type === 'complex_agent') {
        return { type: result.type }
      }
    } catch (error) {
      logger.warn(error, 'Intent classification failed, falling back to complex_agent')
    }

    return { type: 'complex_agent' }
  }

  private async callIntentClassifierLLM(systemInstruction: string, message: string): Promise<string> {
    if (this.provider === 'openai' && this.openai) {
      const response = await this.openai.chat.completions.create({
        model: envVariables.OPENAI_CHAT_MODEL,
        messages: [
          { role: 'system' as const, content: systemInstruction },
          { role: 'user' as const, content: message },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      })
      return response.choices[0]?.message?.content || '{}'
    }

    const response = await this.aiService.generate([{ role: 'user', parts: [{ text: message }] }], {
      systemInstruction,
      temperature: 0.1,
      responseMimeType: 'application/json',
    })
    return response.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text || '{}'
  }

  // ==========================================
  // LLM Engine Implementations
  // ==========================================

  private async queryOpenAI(
    input: string | TChatMessageItem[],
    combinedMessage: string,
    context: IChatContext,
    classification: IChatIntent,
    baseInstruction: string,
    thinkCallback?: TThinkCallback,
  ): Promise<IChatAgentResult> {
    if (!this.openai) {
      throw new Error('OpenAI client is not initialized')
    }

    const toolsConfig = this.getOpenAIToolsConfig(classification)
    const userContent = mapInputToOpenAIContent(input)
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.composeInstruction(baseInstruction) },
      ...this.history.map((h) => ({
        role: (h.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: h.parts?.[0]?.text || '',
      })),
      { role: 'user', content: userContent },
    ]

    try {
      const response = await this.openai.chat.completions.create({
        model: envVariables.OPENAI_CHAT_MODEL,
        messages: openaiMessages,
        tools: toolsConfig.length > 0 ? toolsConfig : undefined,
        temperature: 0.7,
      })

      const { finalResponse, toolUsageCount, toolCredits, totalInputTokens, totalOutputTokens } =
        await this.runOpenAIToolReasoningLoop(
          response,
          openaiMessages,
          toolsConfig,
          context,
          baseInstruction,
          thinkCallback,
        )

      const finalResponseText = finalResponse.choices[0]?.message?.content || ''

      const grandTotalTokens = totalInputTokens + totalOutputTokens
      const llmCredits = grandTotalTokens / this.tokensPerCredit
      const skillUsage = this.computeSkillUsage()
      const rawCredits = llmCredits + toolCredits + skillUsage.overhead
      const totalCreditsUsed = Math.ceil(rawCredits)

      this.history.push({ role: 'user', parts: [{ text: combinedMessage }] })
      this.history.push({ role: 'model', parts: [{ text: finalResponseText }] })

      const metadata: IChatAgentMetadata = {
        totalInputTokens,
        totalOutputTokens,
        grandTotalTokens,
        toolUsageCount,
        totalCreditsUsed,
        remainingCredits: this.remainingCredits ?? 0,
        skillsUsed: skillUsage.breakdown,
      }

      const usage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: grandTotalTokens,
        llmCredits,
        toolCredits,
        skillCredits: skillUsage.overhead,
        creditsUsed: totalCreditsUsed,
        tools: this.executedTools,
        skills: skillUsage.breakdown,
      }

      if (this.suppressFinalAgentMessage && this.pendingAgentSavedMessage) {
        await this.emitDoneFromPresavedMessage(this.pendingAgentSavedMessage, metadata, usage, thinkCallback)
        return { response: '', metadata }
      }

      let savedMessage: ISavedBotMessage | undefined
      if (this.persistHistory) {
        savedMessage = await this.saveBotMessage(finalResponseText, usage)
      }

      if (thinkCallback) {
        await thinkCallback({
          status: 'done',
          response: finalResponseText,
          messageId: savedMessage?.id,
          savedMessage,
          metadata,
        })
      }

      return {
        response: finalResponseText,
        metadata,
      }
    } catch (error) {
      logger.error(error, 'ChatAgent.queryOpenAI execution failed')
      if (error instanceof ChatAgentError) throw error
      throw new ChatAgentError(
        'llm_call',
        error instanceof Error ? error.message : String(error),
        { cause: error },
      )
    }
  }

  private extractOpenAIDirectToolResponse(
    openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  ): string {
    const toolMsg = openaiMessages.slice().reverse().find((msg) => msg.role === 'tool')
    let payloadText = ''
    if (toolMsg && toolMsg.content) {
      if (typeof toolMsg.content === 'string') {
        payloadText = toolMsg.content
      } else if (Array.isArray(toolMsg.content)) {
        payloadText = toolMsg.content.map((part) => ('text' in part ? part.text : '')).join('')
      }
    }
    let responseText = payloadText
    try {
      const parsed = JSON.parse(payloadText)
      if (parsed && parsed.message) {
        responseText = parsed.message
      }
    } catch {}
    return responseText
  }

  private mockOpenAIResponse(
    id: string,
    created: number,
    model: string,
    responseText: string,
    usage: OpenAI.Chat.Completions.ChatCompletion['usage'],
  ): OpenAI.Chat.Completions.ChatCompletion {
    return {
      id,
      object: 'chat.completion',
      created,
      model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: responseText
        },
        finish_reason: 'stop'
      }],
      usage
    } as unknown as OpenAI.Chat.Completions.ChatCompletion
  }

  private async runOpenAIToolReasoningLoop(
    initialResponse: OpenAI.Chat.Completions.ChatCompletion,
    openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    toolsConfig: OpenAI.Chat.Completions.ChatCompletionTool[],
    context: IChatContext,
    baseInstruction: string,
    thinkCallback?: TThinkCallback,
  ): Promise<{
    finalResponse: OpenAI.Chat.Completions.ChatCompletion
    toolUsageCount: number
    toolCredits: number
    totalInputTokens: number
    totalOutputTokens: number
  }> {
    let response = initialResponse
    let totalInputTokens = response.usage?.prompt_tokens || 0
    let totalOutputTokens = response.usage?.completion_tokens || 0
    let toolUsageCount = 0
    let toolCredits = 0
    let step = 0

    let assistantMessage = response.choices[0]?.message
    let toolCalls = assistantMessage?.tool_calls

    const directReturnTools = this.getDirectReturnToolNames()

    while (toolCalls && toolCalls.length > 0) {
      if (step >= ChatAgent.MAX_REASONING_STEPS) {
        logger.warn(
          { userId: this.userId, step, maxSteps: ChatAgent.MAX_REASONING_STEPS },
          '[chat-agent] reasoning loop hit max iterations, forcing summary',
        )
        const summaryInstruction = `You have already used ${step} tool-calling rounds and reached the maximum allowed (${ChatAgent.MAX_REASONING_STEPS}). Do NOT call any more tools. Based on the tool results gathered so far in this conversation, write a final answer to the user's original question now in Cloudy's friendly Thai persona. If the information gathered is insufficient to fully answer, apologize politely and tell the user what you found and what remained unclear — but do not call any tool.`
        openaiMessages[0] = { role: 'system', content: this.composeInstruction(baseInstruction) }
        response = await this.openai!.chat.completions.create({
          model: envVariables.OPENAI_CHAT_MODEL,
          messages: [...openaiMessages, { role: 'system', content: summaryInstruction }],
          temperature: 0.7,
        })
        const summaryUsage = response.usage
        if (summaryUsage) {
          totalInputTokens += summaryUsage.prompt_tokens || 0
          totalOutputTokens += summaryUsage.completion_tokens || 0
        }
        assistantMessage = response.choices[0]?.message
        toolCalls = assistantMessage?.tool_calls
        break
      }

      const pendingToolNames: string[] = []
      for (const call of toolCalls) {
        if (call.type === 'function') {
          pendingToolNames.push(call.function.name)
        }
      }
      await this.emitPreToolThought(assistantMessage?.content, pendingToolNames, thinkCallback)

      this.startNewToolExecutionStep()
      openaiMessages.push({
        role: 'assistant',
        content: assistantMessage?.content || '',
        tool_calls: toolCalls,
      })

      const hasDirectTool = toolCalls.some(
        (call) =>
          call.type === 'function' && call.function?.name && directReturnTools.includes(call.function.name),
      )

      const stepResult = await this.executeOpenAIToolStep(toolCalls, openaiMessages, context, thinkCallback)
      toolUsageCount += stepResult.usageCount
      toolCredits += stepResult.credits
      this.endToolExecutionStep()

      if (hasDirectTool) {
        const responseText = this.extractOpenAIDirectToolResponse(openaiMessages)
        const mockResponse = this.mockOpenAIResponse(
          response.id,
          response.created,
          response.model,
          responseText,
          response.usage,
        )

        return {
          finalResponse: mockResponse,
          toolUsageCount,
          toolCredits,
          totalInputTokens,
          totalOutputTokens,
        }
      }

      openaiMessages[0] = { role: 'system', content: this.composeInstruction(baseInstruction) }
      response = await this.openai!.chat.completions.create({
        model: envVariables.OPENAI_CHAT_MODEL,
        messages: openaiMessages,
        tools: toolsConfig.length > 0 ? toolsConfig : undefined,
        temperature: 0.7,
      })

      const stepUsage = response.usage
      if (stepUsage) {
        totalInputTokens += stepUsage.prompt_tokens || 0
        totalOutputTokens += stepUsage.completion_tokens || 0
      }

      assistantMessage = response.choices[0]?.message
      toolCalls = assistantMessage?.tool_calls

      step += 1
    }

    return {
      finalResponse: response,
      toolUsageCount,
      toolCredits,
      totalInputTokens,
      totalOutputTokens,
    }
  }

  private async queryGemini(
    parts: Part[],
    context: IChatContext,
    classification: IChatIntent,
    baseInstruction: string,
    thinkCallback?: TThinkCallback,
  ): Promise<IChatAgentResult> {
    const toolsConfig = this.getGeminiToolsConfig(classification)
    const contents: Content[] = [...this.history, { role: 'user', parts }]

    try {
      const response = await this.aiService.generate(contents, {
        systemInstruction: this.composeInstruction(baseInstruction),
        tools: toolsConfig,
      })

      let { finalResponse, toolUsageCount, toolCredits, totalInputTokens, totalOutputTokens } =
        await this.runGeminiToolReasoningLoop(
          response,
          contents,
          toolsConfig,
          context,
          baseInstruction,
          thinkCallback,
        )

      let finalResponseText = finalResponse.candidates?.[0]?.content?.parts?.find((p: Part) => p.text)?.text || ''

      if (this.looksLikeRawToolDump(finalResponseText)) {
        const retry = await this.retrySynthesisAfterRawDump(contents, baseInstruction, finalResponseText)
        if (retry.text) {
          finalResponseText = retry.text
          finalResponse = retry.response
        }
        totalInputTokens += retry.inputTokens
        totalOutputTokens += retry.outputTokens
      }

      const grandTotalTokens = totalInputTokens + totalOutputTokens
      const llmCredits = grandTotalTokens / this.tokensPerCredit
      const skillUsage = this.computeSkillUsage()
      const rawCredits = llmCredits + toolCredits + skillUsage.overhead
      const totalCreditsUsed = Math.ceil(rawCredits)

      this.history.push({ role: 'user', parts: [{ text: context.message }] })
      this.history.push({ role: 'model', parts: [{ text: finalResponseText }] })

      const metadata: IChatAgentMetadata = {
        totalInputTokens,
        totalOutputTokens,
        grandTotalTokens,
        toolUsageCount,
        totalCreditsUsed,
        remainingCredits: this.remainingCredits ?? 0,
        skillsUsed: skillUsage.breakdown,
      }

      const usage = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalTokens: grandTotalTokens,
        llmCredits,
        toolCredits,
        skillCredits: skillUsage.overhead,
        creditsUsed: totalCreditsUsed,
        tools: this.executedTools,
        skills: skillUsage.breakdown,
      }

      if (this.suppressFinalAgentMessage && this.pendingAgentSavedMessage) {
        await this.emitDoneFromPresavedMessage(this.pendingAgentSavedMessage, metadata, usage, thinkCallback)
        return { response: '', metadata }
      }

      let savedMessage: ISavedBotMessage | undefined
      if (this.persistHistory) {
        savedMessage = await this.saveBotMessage(finalResponseText, usage)
      }

      if (thinkCallback) {
        await thinkCallback({
          status: 'done',
          response: finalResponseText,
          messageId: savedMessage?.id,
          savedMessage,
          metadata,
        })
      }

      return {
        response: finalResponseText,
        metadata,
      }
    } catch (error) {
      logger.error(error, 'ChatAgent.queryGemini execution failed')
      if (error instanceof ChatAgentError) throw error
      throw new ChatAgentError(
        'llm_call',
        error instanceof Error ? error.message : String(error),
        { cause: error },
      )
    }
  }

  private extractDirectToolResponse(toolResponseParts: Part[], directReturnTools: string[]): string {
    const directPart = toolResponseParts.find(
      (part) => part.functionResponse?.name && directReturnTools.includes(part.functionResponse.name),
    )
    const rawResponse = directPart?.functionResponse?.response
    if (!rawResponse) {
      return ''
    }

    if (typeof rawResponse === 'string') {
      try {
        const parsed = JSON.parse(rawResponse)
        if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
          return parsed.message
        }
      } catch {}
      return rawResponse
    }

    if (typeof rawResponse === 'object' && rawResponse !== null && 'message' in rawResponse) {
      const msg = (rawResponse as Record<string, unknown>).message
      if (typeof msg === 'string') {
        return msg
      }
    }

    return JSON.stringify(rawResponse)
  }

  private mockGeminiResponse(responseText: string): GenerateContentResponse {
    return {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: responseText }]
        }
      }]
    } as unknown as GenerateContentResponse
  }

  private async runGeminiToolReasoningLoop(
    initialResponse: GenerateContentResponse,
    contents: Content[],
    toolsConfig: Tool[] | undefined,
    context: IChatContext,
    baseInstruction: string,
    thinkCallback?: TThinkCallback,
  ): Promise<{
    finalResponse: GenerateContentResponse
    toolUsageCount: number
    toolCredits: number
    totalInputTokens: number
    totalOutputTokens: number
  }> {
    let response = initialResponse
    let totalInputTokens = response.usageMetadata?.promptTokenCount || 0
    let totalOutputTokens = response.usageMetadata?.candidatesTokenCount || 0
    let toolUsageCount = 0
    let toolCredits = 0
    let step = 0

    const directReturnTools = this.getDirectReturnToolNames()

    while (this.hasFunctionCalls(response)) {
      if (step >= ChatAgent.MAX_REASONING_STEPS) {
        logger.warn(
          { userId: this.userId, step, maxSteps: ChatAgent.MAX_REASONING_STEPS },
          '[chat-agent] reasoning loop hit max iterations, forcing summary',
        )
        const summaryInstruction = `${this.composeInstruction(baseInstruction)}\n\nIMPORTANT: You have already used ${step} tool-calling rounds and reached the maximum allowed (${ChatAgent.MAX_REASONING_STEPS}). Do NOT call any more tools. Based on the tool results gathered so far in this conversation, write a final answer to the user's original question now in Cloudy's friendly Thai persona. If the information gathered is insufficient to fully answer, apologize politely and tell the user what you found and what remained unclear — but do not call any tool.`
        response = await this.aiService.generate(contents, {
          systemInstruction: summaryInstruction,
        })
        const summaryUsage = response.usageMetadata
        if (summaryUsage) {
          totalInputTokens += summaryUsage.promptTokenCount || 0
          totalOutputTokens += summaryUsage.candidatesTokenCount || 0
        }
        break
      }

      const modelContent = response.candidates?.[0]?.content
      if (!modelContent) {
        break
      }

      const thinkingText = (modelContent.parts || [])
        .filter((part: Part) => !!part.text)
        .map((part: Part) => part.text)
        .join('')
        .trim()

      const functionCallParts = (modelContent.parts || []).filter((part: Part) => !!part.functionCall)
      const pendingToolNames: string[] = []
      for (const part of functionCallParts) {
        const name = part.functionCall?.name
        if (name) pendingToolNames.push(name)
      }
      await this.emitPreToolThought(thinkingText, pendingToolNames, thinkCallback)

      this.startNewToolExecutionStep()

      const hasDirectTool = functionCallParts.some(
        (part) => part.functionCall?.name && directReturnTools.includes(part.functionCall.name),
      )

      const { toolResponseParts, usageCount, credits } = await this.processToolCalls(
        functionCallParts,
        context,
        thinkCallback,
      )
      toolUsageCount += usageCount
      toolCredits += credits
      this.endToolExecutionStep()

      if (hasDirectTool) {
        const responseText = this.extractDirectToolResponse(toolResponseParts, directReturnTools)
        const mockResponse = this.mockGeminiResponse(responseText)
        return {
          finalResponse: mockResponse,
          toolUsageCount,
          toolCredits,
          totalInputTokens,
          totalOutputTokens,
        }
      }

      contents.push(modelContent)
      contents.push({
        role: 'user',
        parts: toolResponseParts,
      })

      response = await this.aiService.generate(contents, {
        systemInstruction: this.composeInstruction(baseInstruction),
        tools: toolsConfig,
      })

      const stepUsage = response.usageMetadata
      if (stepUsage) {
        totalInputTokens += stepUsage.promptTokenCount || 0
        totalOutputTokens += stepUsage.candidatesTokenCount || 0
      }

      step += 1
    }

    return {
      finalResponse: response,
      toolUsageCount,
      toolCredits,
      totalInputTokens,
      totalOutputTokens,
    }
  }

  // ==========================================
  // Tool & Task Execution Routines
  // ==========================================

  private async executeTasks(context: IChatContext): Promise<void> {
    for (const task of this.tasks) {
      try {
        await task.execute(context)
      } catch (error) {
        logger.error({ error, taskName: task.name }, 'Task execution failed')
      }
    }
  }

  private async executeToolCall(
    name: string,
    args: Record<string, unknown>,
    context: IChatContext,
    thinkCallback?: TThinkCallback,
  ): Promise<string> {
    const tool = this.tools.find((t) => t.name === name)
    if (!tool) {
      return JSON.stringify({ error: 'Tool not found' })
    }

    if (thinkCallback) {
      await thinkCallback({
        status: 'calling_tool',
        toolName: tool.name,
        args,
      })
    }

    try {
      const result = await tool.execute(args, context)
      if (thinkCallback) {
        await thinkCallback({
          status: 'tool_response',
          toolName: tool.name,
          result,
        })
      }
      return result
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message })
    }
  }

  private startNewToolExecutionStep(): void {
    this.currentStepTools.clear()
  }

  private endToolExecutionStep(): void {
    this.lastStepTools = new Set(this.currentStepTools)
  }

  private clearToolExecutionTracking(): void {
    this.lastStepTools.clear()
    this.currentStepTools.clear()
    this.executedTools = []
    this.usedSkills.clear()
    this.suppressFinalAgentMessage = false
    this.pendingAgentSavedMessage = undefined
  }

  private parseToolPayloadObject(payload: unknown): Record<string, unknown> | null {
    let obj: unknown = payload
    if (typeof payload === 'string') {
      try {
        obj = JSON.parse(payload)
      } catch {
        return null
      }
    }
    if (obj === null || typeof obj !== 'object') return null
    return obj as Record<string, unknown>
  }

  private extractSavedBotMessage(handed: unknown): ISavedBotMessage | null {
    if (handed === null || typeof handed !== 'object') return null
    const h = handed as Record<string, unknown>
    if (typeof h.id !== 'string' || !Array.isArray(h.content) || typeof h.createdAt !== 'string') {
      return null
    }
    const parsedDate = new Date(h.createdAt)
    if (Number.isNaN(parsedDate.getTime())) return null
    return {
      id: h.id,
      sender_id: 'bot',
      content: h.content as TChatResponse['content'],
      created_at: parsedDate,
    }
  }

  private checkToolSuppressionMarker(payload: unknown): void {
    const rec = this.parseToolPayloadObject(payload)
    if (!rec) return

    if (rec.__suppress_agent_response === true && !this.suppressFinalAgentMessage) {
      this.suppressFinalAgentMessage = true
      logger.info(
        { userId: this.userId },
        '[chat-agent] tool requested suppression of agent final response (helper pre-saved message)',
      )
    }

    if (this.pendingAgentSavedMessage === undefined) {
      const saved = this.extractSavedBotMessage(rec.__agent_saved_message)
      if (saved) {
        this.pendingAgentSavedMessage = saved
        logger.info(
          { userId: this.userId, chatId: saved.id },
          '[chat-agent] captured tool-pre-saved bot message for use in done event',
        )
      }
    }
  }

  private computeSkillUsage(): {
    overhead: number
    breakdown: Array<{ name: string; overheadCredits: number; toolCount: number }>
  } {
    const breakdown: Array<{ name: string; overheadCredits: number; toolCount: number }> = []
    let overhead = 0
    for (const name of this.usedSkills) {
      const skill = this.skills.find((s) => s.name === name)
      const overheadCredits = skill?.creditCost ?? 0
      const toolCount = this.executedTools.filter((entry) => {
        const tool = this.tools.find((t) => t.name === entry.name)
        return tool?.skillName === name
      }).length
      overhead += overheadCredits
      breakdown.push({ name, overheadCredits, toolCount })
    }
    return { overhead, breakdown }
  }

  private serializeToolArgs(args: Record<string, unknown>): string {
    const sortedKeys = Object.keys(args).sort()
    const sortedObj = sortedKeys.reduce(
      (acc, key) => {
        acc[key] = args[key]
        return acc
      },
      {} as Record<string, unknown>,
    )
    return JSON.stringify(sortedObj)
  }

  private async runToolCall(
    call: { name: string; args: Record<string, unknown> },
    context: IChatContext,
    thinkCallback?: TThinkCallback,
  ): Promise<{ responsePayload: unknown; cost: number }> {
    const serializedArgs = this.serializeToolArgs(call.args)
    const callSignature = `${call.name}:${serializedArgs}`

    // 1. Block tight loops (consecutive repeat of the same tool and arguments from the immediate previous step)
    if (this.lastStepTools.has(callSignature)) {
      logger.warn(
        { toolName: call.name, args: call.args },
        '⚠️ [ChatAgent] Prevented tight loop duplicate tool execution with identical arguments.',
      )
      return {
        responsePayload: {
          error: `Error: Tool "${call.name}" was already executed with the exact same arguments in the immediate previous step. Consecutive execution is blocked to prevent infinite loops.`,
        },
        cost: 0,
      }
    }

    // 2. Prevent parallel duplication within the same step
    if (this.currentStepTools.has(callSignature)) {
      logger.warn(
        { toolName: call.name, args: call.args },
        '⚠️ [ChatAgent] Deduplicated parallel tool call execution in the same step.',
      )
      return {
        responsePayload: {
          error: `Error: Tool "${call.name}" with identical arguments is already scheduled for execution in this step.`,
        },
        cost: 0,
      }
    }

    // Record this execution for the current step
    this.currentStepTools.add(callSignature)

    const responsePayload = await this.executeToolCall(call.name, call.args, context, thinkCallback)
    this.checkToolSuppressionMarker(responsePayload)
    let cost = 0
    const executedTool = this.tools.find((t: IChatTool): boolean => t.name === call.name)
    if (executedTool && executedTool.creditCost) {
      cost = executedTool.creditCost
    }
    if (executedTool?.skillName) {
      this.usedSkills.add(executedTool.skillName)
    }
    this.executedTools.push({ name: call.name, credits: cost })
    return { responsePayload, cost }
  }

  private toFunctionResponseStruct(payload: unknown): Record<string, unknown> {
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
        return { result: parsed }
      } catch {
        return { result: payload }
      }
    }
    if (typeof payload === 'object' && payload !== null) {
      return payload as Record<string, unknown>
    }
    return { result: payload }
  }

  private async processToolCalls(
    functionCallParts: Part[],
    context: IChatContext,
    thinkCallback?: TThinkCallback,
  ): Promise<{ toolResponseParts: Part[]; usageCount: number; credits: number }> {
    const toolResponseParts: Part[] = []
    let usageCount = 0
    let credits = 0
    for (const part of functionCallParts) {
      const call = part.functionCall
      if (!call || !call.name) {
        continue
      }
      const args = (call.args || {}) as Record<string, unknown>
      const { responsePayload, cost } = await this.runToolCall({ name: call.name, args }, context, thinkCallback)
      toolResponseParts.push({
        functionResponse: {
          name: call.name,
          response: this.toFunctionResponseStruct(responsePayload),
        },
      })
      usageCount += 1
      credits += cost
    }
    return { toolResponseParts, usageCount, credits }
  }

  private async executeOpenAIToolStep(
    toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
    openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    context: IChatContext,
    thinkCallback?: TThinkCallback,
  ): Promise<{ usageCount: number; credits: number }> {
    let usageCount = 0
    let credits = 0
    for (const call of toolCalls) {
      if (call.type !== 'function') {
        continue
      }
      const args = JSON.parse(call.function.arguments) as Record<string, unknown>
      const { responsePayload, cost } = await this.runToolCall(
        { name: call.function.name, args },
        context,
        thinkCallback,
      )
      usageCount += 1
      credits += cost

      openaiMessages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: typeof responsePayload === 'string' ? responsePayload : JSON.stringify(responsePayload),
      })
    }
    return { usageCount, credits }
  }

  // ==========================================
  // Firestore Persistence & Memories
  // ==========================================

  /** Derive a plain-text representation of a chat doc's content for LLM history loading. */
  private chatDocToHistoryText(data: FirebaseFirestore.DocumentData): string {
    if (!Array.isArray(data.content)) return ''
    const parts: string[] = []
    for (const item of data.content as Array<Record<string, unknown>>) {
      if (item?.type === 'text' && typeof item.text === 'string') {
        parts.push(item.text)
      } else if (typeof item?.type === 'string') {
        parts.push(`[${item.type} card]`)
      }
    }
    return parts.join(' ').trim()
  }

  private async loadHistoryFromFirestore(): Promise<void> {
    if (this.history.length > 0) {
      return
    }
    try {
      const snapshot = await db.collection('chats').where('user_id', '==', this.userId).get()

      const docs = snapshot.docs
        // Scope multi-turn context to the current session only.
        .filter((doc) => !this.sessionId || doc.data().session_id === this.sessionId)
        .sort((a, b) => {
          const t1 = a.data().created_at?.toDate?.()?.getTime() || 0
          const t2 = b.data().created_at?.toDate?.()?.getTime() || 0
          return t1 - t2
        })

      if (docs.length <= ChatAgent.HISTORY_WINDOW) {
        this.history = docs.map((doc) => {
          const data = doc.data()
          return {
            role: data.sender_id === 'bot' ? ('model' as const) : ('user' as const),
            parts: [{ text: this.chatDocToHistoryText(data) }],
          }
        })
        return
      }

      const olderDocs = docs.slice(0, docs.length - ChatAgent.HISTORY_WINDOW)
      const recentDocs = docs.slice(-ChatAgent.HISTORY_WINDOW)

      const memoriesDoc = await db.collection('user_memories').doc(this.userId).get()
      const memoriesData = memoriesDoc.exists ? (memoriesDoc.data()?.memories as Record<string, string> | undefined) : undefined
      const existingSummary = memoriesData?._chat_summary || ''
      const summarizedCount = parseInt(memoriesData?._chat_summary_count || '0', 10)

      let summary = existingSummary
      const unsummarizedCount = olderDocs.length - summarizedCount

      const shouldSummarize =
        olderDocs.length >= ChatAgent.SUMMARIZE_THRESHOLD - ChatAgent.HISTORY_WINDOW &&
        (existingSummary === '' || unsummarizedCount >= ChatAgent.RESUMMARY_BATCH)

      if (shouldSummarize) {
        summary = await this.summarizeOlderHistory(olderDocs, existingSummary)
        await this.saveChatSummary(summary, olderDocs.length)
      }

      const recentHistory: Content[] = recentDocs.map((doc) => {
        const data = doc.data()
        return {
          role: data.sender_id === 'bot' ? ('model' as const) : ('user' as const),
          parts: [{ text: this.chatDocToHistoryText(data) }],
        }
      })

      if (summary) {
        this.history = [
          {
            role: 'user' as const,
            parts: [{ text: `[CONVERSATION SUMMARY — ประวัติการสนทนาที่ผ่านมา]\n${summary}` }],
          },
          {
            role: 'model' as const,
            parts: [{ text: 'เข้าใจแล้ว ฉันจะคำนึงถึงประวัติการสนทนาที่ผ่านมาด้วย' }],
          },
          ...recentHistory,
        ]
      } else {
        this.history = recentHistory
      }
    } catch (error) {
      logger.error(error, 'Failed to load chat history from Firestore')
    }
  }

  private async summarizeOlderHistory(
    olderDocs: FirebaseFirestore.QueryDocumentSnapshot[],
    existingSummary: string,
  ): Promise<string> {
    try {
      const conversationText = olderDocs
        .map((doc) => {
          const data = doc.data()
          const speaker = data.sender_id === 'bot' ? 'Assistant' : 'User'
          return `${speaker}: ${this.chatDocToHistoryText(data)}`
        })
        .join('\n')

      const contextPrompt = existingSummary
        ? `ต่อไปนี้คือประวัติการสนทนาเพิ่มเติมที่ต้องรวมกับ summary เดิม:\n\nSummary เดิม:\n${existingSummary}\n\nบทสนทนาใหม่:\n${conversationText}`
        : `ต่อไปนี้คือประวัติการสนทนาระหว่าง user กับ AI assistant:\n\n${conversationText}`

      const summary = await this.aiService.summarize(
        contextPrompt,
        'สรุปประวัติการสนทนานี้เป็นภาษาไทยอย่างกระชับ ครอบคลุมหัวข้อสำคัญ ความต้องการ และข้อมูลเกี่ยวกับ user ที่ถูกพูดถึง ไม่เกิน 300 คำ',
      )
      return summary
    } catch (error) {
      logger.error(error, 'Failed to summarize older chat history')
      return existingSummary
    }
  }

  private async saveChatSummary(summary: string, summarizedCount: number): Promise<void> {
    try {
      const docRef = db.collection('user_memories').doc(this.userId)
      await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef)
        const existing = doc.exists ? ((doc.data()?.memories || {}) as Record<string, string>) : {}
        transaction.set(
          docRef,
          {
            userId: this.userId,
            memories: {
              ...existing,
              _chat_summary: summary,
              _chat_summary_count: String(summarizedCount),
            },
            updatedAt: getUtcTime().toDate(),
          },
          { merge: true },
        )
      })
    } catch (error) {
      logger.error(error, 'Failed to save chat summary to Firestore')
    }
  }

  async markUserMessageAsFailed(
    messageId: string,
    errorMessage: string,
    options?: { stage?: TChatAgentStage; code?: string },
  ): Promise<void> {
    try {
      await db
        .collection('chats')
        .doc(messageId)
        .update({
          error: {
            message: errorMessage.slice(0, 500),
            stage: options?.stage ?? 'unknown',
            ...(options?.code ? { code: options.code } : {}),
          },
        })
    } catch (error) {
      logger.error({ error, messageId }, 'Failed to mark user message as failed in Firestore')
    }
  }

  async saveBotErrorMessage(
    errorMessage: string,
    options?: { stage?: TChatAgentStage; code?: string },
  ): Promise<ISavedBotMessage | undefined> {
    try {
      const docRef = db.collection('chats').doc()
      const createdAt = getUtcTime().toDate()
      const data = {
        sender_id: 'bot' as const,
        content: [] as TChatResponse['content'],
        feedback: null,
        created_at: createdAt,
        error: {
          message: errorMessage.slice(0, 500),
          stage: options?.stage ?? 'unknown',
          ...(options?.code ? { code: options.code } : {}),
        },
      }
      await docRef.set({ user_id: this.userId, ...(this.sessionId ? { session_id: this.sessionId } : {}), ...data })
      return { id: docRef.id, ...data }
    } catch (error) {
      logger.error({ error }, 'Failed to save bot error message to Firestore')
      return undefined
    }
  }

  private async saveUserMessage(message: string): Promise<ISavedUserMessage> {
    try {
      const docRef = db.collection('chats').doc()
      const createdAt = getUtcTime().toDate()
      const content: TChatResponse['content'] = [{ type: 'text', text: message }]
      await docRef.set({
        user_id: this.userId,
        sender_id: this.userId,
        content,
        feedback: null,
        error: null,
        created_at: createdAt,
        ...(this.sessionId ? { session_id: this.sessionId } : {}),
      })
      return {
        id: docRef.id,
        sender_id: this.userId,
        content,
        created_at: createdAt,
      }
    } catch (error) {
      throw new ChatAgentError('persist_user_message', 'Failed to save user message to Firestore', {
        cause: error,
      })
    }
  }

  /** Attach LLM/tool usage fields to a chat doc that a tool pre-saved, then deduct credits from the user. */
  private async attachUsageToPresavedAndDeductCredits(
    chatId: string,
    usage: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      llmCredits: number
      toolCredits: number
      skillCredits: number
      creditsUsed: number
      tools: Array<{ name: string; credits: number }>
      skills: Array<{ name: string; overheadCredits: number; toolCount: number }>
    },
  ): Promise<void> {
    try {
      await db.collection('chats').doc(chatId).update({
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
        total_tokens: usage.totalTokens,
        llm_credits: Math.ceil(usage.llmCredits),
        tool_credits: Math.ceil(usage.toolCredits),
        skill_credits: Math.ceil(usage.skillCredits),
        credits_used: Math.ceil(usage.creditsUsed),
        tools: usage.tools,
        skills_used: usage.skills.map((s) => ({
          name: s.name,
          overhead_credits: s.overheadCredits,
          tool_count: s.toolCount,
        })),
        error: null,
      })
    } catch (error) {
      logger.warn({ error, chatId }, '[chat-agent] failed to attach usage to pre-saved chat doc')
    }

    let remaining = 0
    if (usage.creditsUsed > 0) {
      const userDocRef = db.collection('users').doc(this.userId)
      try {
        await db.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userDocRef)
          if (userDoc.exists) {
            const currentCredit = userDoc.data()?.credit ?? 0
            remaining = Math.max(0, currentCredit - usage.creditsUsed)
            transaction.update(userDocRef, { credit: remaining })
          }
        })
      } catch (error) {
        logger.warn({ error }, '[chat-agent] failed to deduct credits for pre-saved bot message')
      }
    } else {
      const userDoc = await db.collection('users').doc(this.userId).get()
      if (userDoc.exists) remaining = userDoc.data()?.credit ?? 0
    }
    this.remainingCredits = remaining
  }

  private async retrySynthesisAfterRawDump(
    contents: Content[],
    baseInstruction: string,
    previewText: string,
  ): Promise<{ text: string; response: GenerateContentResponse; inputTokens: number; outputTokens: number }> {
    logger.warn(
      { userId: this.userId, preview: previewText.slice(0, 200) },
      '[chat-agent] model echoed raw tool output, forcing synthesis pass',
    )
    const synthesisInstruction = `${this.composeInstruction(baseInstruction)}\n\nCRITICAL: The previous turn dumped raw JSON tool output instead of answering the user. You MUST now write a final natural Thai answer in Cloudy's persona based on the tool results in this conversation. Do NOT include any JSON, braces, field names, or URL lists. Do NOT call any tools. Just write prose that answers the user's original question.`
    const synthesisResponse = await this.aiService.generate(contents, {
      systemInstruction: synthesisInstruction,
    })
    const synthText =
      synthesisResponse.candidates?.[0]?.content?.parts?.find((p: Part) => p.text)?.text || ''
    const usable = synthText && !this.looksLikeRawToolDump(synthText)
    return {
      text: usable ? synthText : '',
      response: synthesisResponse,
      inputTokens: synthesisResponse.usageMetadata?.promptTokenCount || 0,
      outputTokens: synthesisResponse.usageMetadata?.candidatesTokenCount || 0,
    }
  }

  private async emitDoneFromPresavedMessage(
    presaved: ISavedBotMessage,
    metadata: IChatAgentMetadata,
    usage: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      llmCredits: number
      toolCredits: number
      skillCredits: number
      creditsUsed: number
      tools: Array<{ name: string; credits: number }>
      skills: Array<{ name: string; overheadCredits: number; toolCount: number }>
    },
    thinkCallback?: TThinkCallback,
  ): Promise<void> {
    if (this.persistHistory && usage.creditsUsed > 0) {
      await this.attachUsageToPresavedAndDeductCredits(presaved.id, usage)
    }
    metadata.remainingCredits = this.remainingCredits ?? metadata.remainingCredits
    logger.info(
      { userId: this.userId, presavedId: presaved.id },
      '[chat-agent] using tool-pre-saved message in done event (suppressed agent text)',
    )
    if (thinkCallback) {
      await thinkCallback({
        status: 'done',
        response: '',
        messageId: presaved.id,
        savedMessage: presaved,
        metadata,
      })
    }
  }

  private async saveBotMessage(
    responseText: string,
    usage?: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      llmCredits: number
      toolCredits: number
      skillCredits: number
      creditsUsed: number
      tools: Array<{ name: string; credits: number }>
      skills: Array<{ name: string; overheadCredits: number; toolCount: number }>
    },
  ): Promise<ISavedBotMessage | undefined> {
    let savedBotMessage: ISavedBotMessage | undefined
    try {
      const botDocRef = db.collection('chats').doc()
      const botCreatedAt = getUtcTime().toDate()
      const content: TChatResponse['content'] = [{ type: 'text', text: responseText }]
      const botData = {
        sender_id: 'bot' as const,
        content,
        feedback: null,
        error: null,
        created_at: botCreatedAt,
        ...(usage
          ? {
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              total_tokens: usage.totalTokens,
              llm_credits: Math.ceil(usage.llmCredits),
              tool_credits: Math.ceil(usage.toolCredits),
              skill_credits: Math.ceil(usage.skillCredits),
              credits_used: Math.ceil(usage.creditsUsed),
              tools: usage.tools,
              skills_used: usage.skills.map((s) => ({
                name: s.name,
                overhead_credits: s.overheadCredits,
                tool_count: s.toolCount,
              })),
            }
          : {}),
      }
      savedBotMessage = { id: botDocRef.id, ...botData }
      await botDocRef.set({ user_id: this.userId, ...(this.sessionId ? { session_id: this.sessionId } : {}), ...botData })

      let remaining = 0
      if (usage && usage.creditsUsed > 0) {
        const userDocRef = db.collection('users').doc(this.userId)
        await db.runTransaction(async (transaction) => {
          const userDoc = await transaction.get(userDocRef)
          if (userDoc.exists) {
            const currentCredit = userDoc.data()?.credit ?? 0
            remaining = Math.max(0, currentCredit - usage.creditsUsed)
            transaction.update(userDocRef, { credit: remaining })
          }
        })
      } else {
        const userDoc = await db.collection('users').doc(this.userId).get()
        if (userDoc.exists) {
          remaining = userDoc.data()?.credit ?? 0
        }
      }
      this.remainingCredits = remaining
    } catch (error) {
      logger.error(error, 'Failed to save bot message and deduct credits to Firestore')
    }
    return savedBotMessage
  }

  private async loadMemoriesFromFirestore(): Promise<string> {
    try {
      const doc = await db.collection('user_memories').doc(this.userId).get()
      if (doc.exists) {
        const data = doc.data()
        const memories = (data?.memories || {}) as Record<string, string>
        // Exclude internal bookkeeping keys (e.g. _chat_summary) from the profile.
        const keys = Object.keys(memories).filter((k) => !k.startsWith('_'))
        if (keys.length > 0) {
          return '\nUser Memories Profile:\n' + keys.map((k) => `- ${k}: ${memories[k]}`).join('\n')
        }
      }
    } catch (error) {
      logger.error(error, 'Failed to load user memories from Firestore')
    }
    return ''
  }

  // ==========================================
  // Private Mappers & Helper Builders
  // ==========================================

  private getDirectReturnToolNames(): string[] {
    return this.tools.filter((t) => t.directReturn === true).map((t) => t.name)
  }

  private buildAutoThought(pendingToolNames: string[]): string {
    if (pendingToolNames.length === 0) return ''
    const labels = pendingToolNames.map((name) => {
      const tool = this.tools.find((t) => t.name === name)
      const skillLabel = tool?.skillName ? `${tool.skillName}:${name}` : name
      return skillLabel
    })
    return `กำลังเรียกใช้: ${labels.join(', ')}`
  }

  private async emitPreToolThought(
    llmText: string | null | undefined,
    pendingToolNames: string[],
    thinkCallback?: TThinkCallback,
  ): Promise<void> {
    if (!thinkCallback) return
    const thoughtMessage = (llmText && llmText.trim()) || this.buildAutoThought(pendingToolNames)
    if (thoughtMessage) {
      await thinkCallback({ status: 'thinking', message: thoughtMessage })
    }
  }

  private createTaskCompleteTool(): IChatTool {
    return {
      name: 'task_complete',
      description:
        'Call this tool ONLY when you have fully completed the user\'s request and want to deliver the final answer. The `message` parameter is the natural-language reply that will be shown to the user verbatim. Do NOT call this tool if more tool calls are still needed.',
      parameters: {
        type: 'OBJECT',
        properties: {
          message: {
            type: 'STRING',
            description: 'The final natural-language reply to send to the user.',
          },
        },
        required: ['message'],
      },
      execute: async (args: Record<string, unknown>): Promise<string> => {
        const message = typeof args.message === 'string' ? args.message : ''
        return JSON.stringify({ message })
      },
      creditCost: 0,
      allowDirectInvoke: false,
      directReturn: true,
    }
  }

  private createRememberTool(): IChatTool {
    return {
      name: 'remember_user_fact',
      description:
        'Call this tool to save, update, or remember an important fact, preference, or piece of information about the user for future conversations.',
      parameters: {
        type: 'OBJECT',
        properties: {
          key: {
            type: 'STRING',
            description: 'The category or key of the fact (e.g., hobby, user_name, allergy, preference).',
          },
          value: {
            type: 'STRING',
            description:
              'The description of the fact to remember (e.g., likes cycling, Somchai, allergic to peanuts, wants short answers).',
          },
        },
        required: ['key', 'value'],
      },
      execute: async (args: Record<string, unknown>, context: IChatContext): Promise<string> => {
        const docRef = db.collection('user_memories').doc(context.userId)
        await db.runTransaction(async (transaction) => {
          const doc = await transaction.get(docRef)
          let memories: Record<string, string> = {}
          if (doc.exists) {
            memories = (doc.data()?.memories || {}) as Record<string, string>
          }
          memories[args.key as string] = args.value as string
          transaction.set(
            docRef,
            {
              userId: context.userId,
              memories,
              updatedAt: new Date(),
            },
            { merge: true },
          )
        })
        return `Successfully remembered user fact: ${args.key as string} = ${args.value as string}`
      },
      creditCost: 2.0,
    }
  }

  private getToolsConfig(selectedTools?: IChatTool[]): Tool[] | undefined {
    const list = selectedTools ?? this.tools
    if (list.length === 0) {
      return undefined
    }
    return [
      {
        functionDeclarations: list.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ]
  }

  /** Static parts of the system prompt — fetched once per query, safe to cache for the duration of a single user turn. */
  private async buildBaseInstruction(context?: IChatContext): Promise<string> {
    let memoriesText = ''
    if (this.persistMemory) {
      memoriesText = await this.loadMemoriesFromFirestore()
    }

    let userProfileText = ''
    try {
      const userDoc = await db.collection('users').doc(this.userId).get()
      if (userDoc.exists) {
        const userData = userDoc.data()
        const username = userData?.username || 'คุณปี๊บ'
        userProfileText = `\n\nUser Profile Information:\n- User ID: ${this.userId}\n- Username: ${username}\n- Always address the user as "คุณ ${username}" in Thai responses.`
      }
    } catch (e) {
      logger.warn(e, 'Failed to fetch user profile for dynamic instruction injection')
    }

    let taskSkillsText = ''
    if (this.tasks && this.tasks.length > 0) {
      const activeSkills = this.tasks
        .filter((t) => t.skill && t.skillInstruction)
        .map((t) => `[Skill: ${t.skill}] - Instruction Rule: ${t.skillInstruction}${context?.metadata?.[t.skill!] ? ` (Detected ${t.skill} context value: "${context.metadata[t.skill!]}")` : ''}`)
        .join('\n')
      if (activeSkills) {
        taskSkillsText = `\n\nActive Task Skills Guidelines:\n${activeSkills}`
      }
    }

    let skillsCatalogText = ''
    if (this.skills.length > 0) {
      const blocks = this.skills
        .map((skill) => {
          const desc = skill.description ? `${skill.description}\n\n` : ''
          return `═══ ${skill.name} ═══\n${desc}${skill.instruction}`
        })
        .join('\n\n')
      skillsCatalogText = `\n\nAvailable Skills (capabilities you have access to via tool calls):\n\n${blocks}`
    }

    return `${this.persona}\n\n${this.systemInstruction}${userProfileText}${memoriesText}${taskSkillsText}${skillsCatalogText}`
  }

  /** Dynamic time suffix — recomputed every reasoning round so multi-round loops see fresh "now". */
  private getCurrentTimeSuffix(): string {
    const now = getLocalTime()
    const nowIso = now.format('YYYY-MM-DDTHH:mm:ssZ')
    const today = now.format('YYYY-MM-DD')
    const tomorrow = now.add(1, 'day').format('YYYY-MM-DD')
    const yesterday = now.subtract(1, 'day').format('YYYY-MM-DD')
    const dayName = now.format('dddd')
    return `

=== CURRENT DATETIME (Asia/Bangkok, +07:00) — SINGLE SOURCE OF TRUTH ===
Now           : ${nowIso} (${dayName})
Today (วันนี้)  : ${today}
Tomorrow (พรุ่งนี้): ${tomorrow}
Yesterday (เมื่อวาน): ${yesterday}

CRITICAL: When the user says "วันนี้" / "today", use ${today}. When the user says "พรุ่งนี้" / "tomorrow", use ${tomorrow}. When the user says "เมื่อวาน" / "yesterday", use ${yesterday}. Do NOT compute these dates from your own training-data calendar — it is stale. Always use the values above verbatim.`
  }

  private composeInstruction(baseInstruction: string): string {
    return `${baseInstruction}${this.getCurrentTimeSuffix()}`
  }

  private hasFunctionCalls(response: GenerateContentResponse): boolean {
    return !!response.candidates?.[0]?.content?.parts?.some((part) => !!part.functionCall)
  }

  private hasKnownDumpKeywords(text: string): boolean {
    if (/"(?:source|results|query|timestamp)"\s*:/.test(text)) return true
    // Pattern: model emitted a tool-call envelope as text — JSON-shaped prefix that
    // mentions "action"/"expenses"/"schedules"/"todos"/etc. (missed function call).
    return /"(?:action|expenses|schedules|todos|moods|filter)"\s*:/.test(text.slice(0, 400))
  }

  private isJsonOrJsonPrefix(text: string): boolean {
    try {
      JSON.parse(text)
      return true
    } catch {}
    const prefixEnd = this.findJsonPrefixEnd(text)
    if (prefixEnd <= 0) return false
    try {
      JSON.parse(text.slice(0, prefixEnd))
      return true
    } catch {
      return false
    }
  }

  private looksLikeRawToolDump(text: string): boolean {
    if (!text) return false
    const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
    if (trimmed.length < 2) return false
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false
    if (this.hasKnownDumpKeywords(trimmed)) return true
    return this.isJsonOrJsonPrefix(trimmed)
  }

  /** Returns index right after the first balanced JSON object/array prefix, or -1. */
  private findJsonPrefixEnd(text: string): number {
    if (!text) return -1
    const opener = text[0]
    if (opener !== '{' && opener !== '[') return -1
    let depth = 0
    let inString = false
    let escape = false
    for (let i = 0; i < text.length; i++) {
      const c = text[i]
      if (escape) { escape = false; continue }
      if (c === '\\') { escape = true; continue }
      if (c === '"') { inString = !inString; continue }
      if (inString) continue
      if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') {
        depth--
        if (depth === 0) return i + 1
      }
    }
    return -1
  }

  private getOpenAIToolsConfig(classification: IChatIntent): OpenAI.Chat.Completions.ChatCompletionTool[] {
    let selectedTools: IChatTool[] = []
    if (classification.type === 'complex_agent') {
      selectedTools = this.tools
    } else if (classification.type === 'direct_tool' && classification.toolName) {
      const targetTool = this.tools.find((t) => t.name === classification.toolName)
      if (targetTool) {
        selectedTools = [targetTool]
      }
    }
    return selectedTools.map(
      (tool): OpenAI.Chat.Completions.ChatCompletionTool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: mapParametersToOpenAI(tool.parameters),
        },
      }),
    )
  }

  private getGeminiToolsConfig(classification: IChatIntent): Tool[] | undefined {
    let selectedTools: IChatTool[] = []
    if (classification.type === 'complex_agent') {
      selectedTools = this.tools
    } else if (classification.type === 'direct_tool' && classification.toolName) {
      const targetTool = this.tools.find((t) => t.name === classification.toolName)
      if (targetTool) {
        selectedTools = [targetTool]
      }
    }
    return this.getToolsConfig(selectedTools)
  }
}
