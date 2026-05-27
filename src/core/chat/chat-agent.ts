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
  IChatAgentMetadata,
  IChatAgentResult,
  IChatAgentOptions,
  IChatIntent,
  TChatMessageItem,
  TThinkCallback,
} from '~/src/core/chat/chat.type'
import type { Content, Tool, GenerateContentResponse, Part } from '@google/genai'

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
  private tasks: IChatTask[] = []
  private lastStepTools = new Set<string>()
  private currentStepTools = new Set<string>()
  private executedTools: Array<{ name: string; credits: number }> = []
  private remainingCredits: number | null = null

  private static readonly HISTORY_WINDOW = 20
  private static readonly SUMMARIZE_THRESHOLD = 40
  private static readonly RESUMMARY_BATCH = 10

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
    this.history = options.history ?? []
    this.persona = options.persona ?? DEFAULT_PERSONA
    this.systemInstruction = options.systemInstruction ?? AGENT_SYSTEM_INSTRUCTION
    this.persistHistory = options.persistHistory !== false
    this.persistMemory = options.persistMemory !== false
    this.tokensPerCredit = options.tokensPerCredit ?? 1000
    this.disableClassifier = options.disableClassifier === true

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

  addTool(tool: IChatTool): this {
    this.tools.push(tool)
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

    const context: IChatContext = {
      userId: this.userId,
      message: combinedMessage,
      history: this.history,
      metadata: {},
    }

    await this.executeTasks(context)

    // 1. Run intent classification
    const classification = await this.classifyIntent(combinedMessage)
    const dynamicInstruction = await this.getDynamicInstruction(context)

    // 2. Direct Tool Routing (Deterministic execution bypass)
    if (classification.type === 'direct_tool' && classification.toolName && classification.args) {
      return this.handleDirectToolQuery(
        classification.toolName,
        classification.args,
        combinedMessage,
        parts,
        context,
        dynamicInstruction,
        thinkCallback,
      )
    }

    // 3. Engine-specific reasoning loop execution
    if (this.provider === 'openai') {
      return this.queryOpenAI(input, combinedMessage, context, classification, dynamicInstruction, thinkCallback)
    }

    return this.queryGemini(parts, context, classification, dynamicInstruction, thinkCallback)
  }

  // ==========================================
  // Intent Classification & Routing
  // ==========================================

  private async classifyIntent(message: string): Promise<IChatIntent> {
    if (this.disableClassifier) {
      return { type: 'complex_agent' }
    }
    const toolNames = this.tools.map((t) => t.name)
    if (toolNames.length === 0) {
      return { type: 'general_chat' }
    }

    const toolsDescription = this.tools
      .map((t) => {
        return `Tool Name: "${t.name}"
Description: ${t.description}
Parameters JSON Schema: ${JSON.stringify(t.parameters)}`
      })
      .join('\n\n')

    const systemInstruction = CLASSIFIER_SYSTEM_INSTRUCTION_TEMPLATE.replace('{{TOOLS_DESCRIPTION}}', toolsDescription)

    try {
      const jsonText = await this.callIntentClassifierLLM(systemInstruction, message)
      const result = JSON.parse(jsonText) as IChatIntent
      if (result.type === 'direct_tool' && result.toolName && toolNames.includes(result.toolName)) {
        return { type: 'direct_tool', toolName: result.toolName, args: result.args || {} }
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

  private async handleDirectToolQuery(
    toolName: string,
    args: Record<string, unknown>,
    combinedMessage: string,
    parts: Part[],
    context: IChatContext,
    dynamicInstruction: string,
    thinkCallback?: TThinkCallback,
  ): Promise<IChatAgentResult> {
    const { responsePayload, cost } = await this.runToolCall({ name: toolName, args }, context, thinkCallback)

    let responseText = ''
    const directReturnTools = ['manage_expenses', 'create_schedule', 'manage_todos']
    if (directReturnTools.includes(toolName)) {
      const payloadStr = typeof responsePayload === 'string' ? responsePayload : JSON.stringify(responsePayload)
      responseText = payloadStr
      try {
        const parsed = JSON.parse(payloadStr)
        if (parsed && parsed.message) {
          responseText = parsed.message
        }
      } catch {}

      const grandTotalTokens = 0
      const totalCreditsUsed = cost

      this.history.push({ role: 'user', parts: [{ text: combinedMessage }] })
      this.history.push({ role: 'model', parts: [{ text: responseText }] })

      if (this.persistHistory) {
        await this.saveConversationTurn(combinedMessage, responseText, {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          llmCredits: 0,
          toolCredits: cost,
          creditsUsed: totalCreditsUsed,
          tools: this.executedTools,
        })
      }

      const metadata: IChatAgentMetadata = {
        totalInputTokens: 0,
        totalOutputTokens: 0,
        grandTotalTokens: 0,
        toolUsageCount: 1,
        totalCreditsUsed,
        remainingCredits: this.remainingCredits ?? 0,
      }

      if (thinkCallback) {
        await thinkCallback({
          status: 'done',
          response: responseText,
          metadata,
        })
      }

      return {
        response: responseText,
        metadata,
      }
    }

    const { responseText: confirmedText, inputTokens, outputTokens } = await this.generateDirectToolConfirmation(
      toolName,
      responsePayload,
      combinedMessage,
      parts,
      dynamicInstruction,
    )
    responseText = confirmedText

    const grandTotalTokens = inputTokens + outputTokens
    const llmCredits = grandTotalTokens / this.tokensPerCredit
    const rawCredits = llmCredits + cost
    const totalCreditsUsed = Math.ceil(rawCredits)

    this.history.push({ role: 'user', parts: [{ text: combinedMessage }] })
    this.history.push({ role: 'model', parts: [{ text: responseText }] })

    if (this.persistHistory) {
      await this.saveConversationTurn(combinedMessage, responseText, {
        inputTokens,
        outputTokens,
        totalTokens: grandTotalTokens,
        llmCredits,
        toolCredits: cost,
        creditsUsed: totalCreditsUsed,
        tools: this.executedTools,
      })
    }

    const metadata: IChatAgentMetadata = {
      totalInputTokens: inputTokens,
      totalOutputTokens: outputTokens,
      grandTotalTokens,
      toolUsageCount: 1,
      totalCreditsUsed,
      remainingCredits: this.remainingCredits ?? 0,
    }

    if (thinkCallback) {
      await thinkCallback({
        status: 'done',
        response: responseText,
        metadata,
      })
    }

    return {
      response: responseText,
      metadata,
    }
  }

  private async generateDirectToolConfirmation(
    toolName: string,
    responsePayload: unknown,
    combinedMessage: string,
    parts: Part[],
    dynamicInstruction: string,
  ): Promise<{ responseText: string; inputTokens: number; outputTokens: number }> {
    const confirmationInstruction = `${dynamicInstruction}\n\nAn action was performed directly for the user. Tool name: "${toolName}". Tool result payload: ${JSON.stringify(responsePayload)}. Confirm this to the user in a friendly natural Thai response.`

    if (this.provider === 'openai' && this.openai) {
      const response = await this.openai.chat.completions.create({
        model: envVariables.OPENAI_CHAT_MODEL,
        messages: [
          { role: 'system', content: confirmationInstruction },
          ...this.history.map((h) => ({
            role: (h.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: h.parts?.[0]?.text || '',
          })),
          { role: 'user', content: combinedMessage },
        ],
        temperature: 0.7,
      })
      const usage = response.usage
      return {
        responseText: response.choices[0]?.message?.content || '',
        inputTokens: usage?.prompt_tokens || 0,
        outputTokens: usage?.completion_tokens || 0,
      }
    } else {
      const response = await this.aiService.generate([...this.history, { role: 'user', parts }], {
        systemInstruction: confirmationInstruction,
        temperature: 0.7,
      })
      const usage = response.usageMetadata
      return {
        responseText: response.candidates?.[0]?.content?.parts?.find((p: Part) => p.text)?.text || '',
        inputTokens: usage?.promptTokenCount || 0,
        outputTokens: usage?.candidatesTokenCount || 0,
      }
    }
  }

  // ==========================================
  // LLM Engine Implementations
  // ==========================================

  private async queryOpenAI(
    input: string | TChatMessageItem[],
    combinedMessage: string,
    context: IChatContext,
    classification: IChatIntent,
    dynamicInstruction: string,
    thinkCallback?: TThinkCallback,
  ): Promise<IChatAgentResult> {
    if (!this.openai) {
      throw new Error('OpenAI client is not initialized')
    }

    const toolsConfig = this.getOpenAIToolsConfig(classification)
    const userContent = mapInputToOpenAIContent(input)
    const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: dynamicInstruction },
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
        await this.runOpenAIToolReasoningLoop(response, openaiMessages, toolsConfig, context, thinkCallback)

      const finalResponseText = finalResponse.choices[0]?.message?.content || ''

      const grandTotalTokens = totalInputTokens + totalOutputTokens
      const llmCredits = grandTotalTokens / this.tokensPerCredit
      const rawCredits = llmCredits + toolCredits
      const totalCreditsUsed = Math.ceil(rawCredits)

      this.history.push({ role: 'user', parts: [{ text: combinedMessage }] })
      this.history.push({ role: 'model', parts: [{ text: finalResponseText }] })

      if (this.persistHistory) {
        await this.saveConversationTurn(combinedMessage, finalResponseText, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: grandTotalTokens,
          llmCredits,
          toolCredits,
          creditsUsed: totalCreditsUsed,
          tools: this.executedTools,
        })
      }

      const metadata: IChatAgentMetadata = {
        totalInputTokens,
        totalOutputTokens,
        grandTotalTokens,
        toolUsageCount,
        totalCreditsUsed,
        remainingCredits: this.remainingCredits ?? 0,
      }

      if (thinkCallback) {
        await thinkCallback({
          status: 'done',
          response: finalResponseText,
          metadata,
        })
      }

      return {
        response: finalResponseText,
        metadata,
      }
    } catch (error) {
      logger.error(error, 'ChatAgent.queryOpenAI execution failed')
      throw error
    }
  }

  private async runOpenAIToolReasoningLoop(
    initialResponse: OpenAI.Chat.Completions.ChatCompletion,
    openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    toolsConfig: OpenAI.Chat.Completions.ChatCompletionTool[],
    context: IChatContext,
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

    let assistantMessage = response.choices[0]?.message
    let toolCalls = assistantMessage?.tool_calls

    while (toolCalls && toolCalls.length > 0) {
      if (thinkCallback && assistantMessage?.content) {
        await thinkCallback({ status: 'thinking', message: assistantMessage.content })
      }

      this.startNewToolExecutionStep()
      openaiMessages.push({
        role: 'assistant',
        content: assistantMessage?.content || '',
        tool_calls: toolCalls,
      })

      const directReturnTools = ['manage_expenses', 'create_schedule', 'manage_todos']
      const hasDirectTool = toolCalls.some(call => call.type === 'function' && call.function?.name && directReturnTools.includes(call.function.name))

      const stepResult = await this.executeOpenAIToolStep(toolCalls, openaiMessages, context, thinkCallback)
      toolUsageCount += stepResult.usageCount
      toolCredits += stepResult.credits
      this.endToolExecutionStep()

      if (hasDirectTool) {
        // Find the last tool message added to openaiMessages
        const toolMsg = openaiMessages.slice().reverse().find(msg => msg.role === 'tool')
        let payloadText = ''
        if (toolMsg && toolMsg.content) {
          if (typeof toolMsg.content === 'string') {
            payloadText = toolMsg.content
          } else if (Array.isArray(toolMsg.content)) {
            payloadText = toolMsg.content.map(part => 'text' in part ? part.text : '').join('')
          }
        }
        let responseText = payloadText
        try {
          const parsed = JSON.parse(payloadText)
          if (parsed && parsed.message) responseText = parsed.message
        } catch {}

        // Mock a final OpenAI completion response
        const mockResponse = {
          id: response.id,
          object: 'chat.completion',
          created: response.created,
          model: response.model,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: responseText
            },
            finish_reason: 'stop'
          }],
          usage: response.usage
        } as unknown as OpenAI.Chat.Completions.ChatCompletion
        
        return {
          finalResponse: mockResponse,
          toolUsageCount,
          toolCredits,
          totalInputTokens,
          totalOutputTokens,
        }
      }

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
    dynamicInstruction: string,
    thinkCallback?: TThinkCallback,
  ): Promise<IChatAgentResult> {
    const toolsConfig = this.getGeminiToolsConfig(classification)
    const contents: Content[] = [...this.history, { role: 'user', parts }]

    try {
      const response = await this.aiService.generate(contents, {
        systemInstruction: dynamicInstruction,
        tools: toolsConfig,
      })

      const { finalResponse, toolUsageCount, toolCredits, totalInputTokens, totalOutputTokens } =
        await this.runGeminiToolReasoningLoop(
          response,
          contents,
          toolsConfig,
          context,
          dynamicInstruction,
          thinkCallback,
        )

      const finalResponseText = finalResponse.candidates?.[0]?.content?.parts?.find((p: Part) => p.text)?.text || ''

      const grandTotalTokens = totalInputTokens + totalOutputTokens
      const llmCredits = grandTotalTokens / this.tokensPerCredit
      const rawCredits = llmCredits + toolCredits
      const totalCreditsUsed = Math.ceil(rawCredits)

      this.history.push({ role: 'user', parts: [{ text: context.message }] })
      this.history.push({ role: 'model', parts: [{ text: finalResponseText }] })

      if (this.persistHistory) {
        await this.saveConversationTurn(context.message, finalResponseText, {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          totalTokens: grandTotalTokens,
          llmCredits,
          toolCredits,
          creditsUsed: totalCreditsUsed,
          tools: this.executedTools,
        })
      }

      const metadata: IChatAgentMetadata = {
        totalInputTokens,
        totalOutputTokens,
        grandTotalTokens,
        toolUsageCount,
        totalCreditsUsed,
        remainingCredits: this.remainingCredits ?? 0,
      }

      if (thinkCallback) {
        await thinkCallback({
          status: 'done',
          response: finalResponseText,
          metadata,
        })
      }

      return {
        response: finalResponseText,
        metadata,
      }
    } catch (error) {
      logger.error(error, 'ChatAgent.queryGemini execution failed')
      throw error
    }
  }

  private async runGeminiToolReasoningLoop(
    initialResponse: GenerateContentResponse,
    contents: Content[],
    toolsConfig: Tool[] | undefined,
    context: IChatContext,
    dynamicInstruction: string,
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

    while (this.hasFunctionCalls(response)) {
      const modelContent = response.candidates?.[0]?.content
      if (!modelContent) {
        break
      }

      const thinkingText = (modelContent.parts || [])
        .filter((part: Part) => !!part.text)
        .map((part: Part) => part.text)
        .join('')
        .trim()

      if (thinkCallback && thinkingText) {
        await thinkCallback({ status: 'thinking', message: thinkingText })
      }

      this.startNewToolExecutionStep()
      const functionCallParts = (modelContent.parts || []).filter((part: Part) => !!part.functionCall)

      const directReturnTools = ['manage_expenses', 'create_schedule', 'manage_todos']
      const hasDirectTool = functionCallParts.some(part => part.functionCall?.name && directReturnTools.includes(part.functionCall.name))

      const { toolResponseParts, usageCount, credits } = await this.processToolCalls(
        functionCallParts,
        context,
        thinkCallback,
      )
      toolUsageCount += usageCount
      toolCredits += credits
      this.endToolExecutionStep()

      if (hasDirectTool) {
        // Find the first executed direct tool response
        const directPart = toolResponseParts.find(part => part.functionResponse?.name && directReturnTools.includes(part.functionResponse.name))
        const rawResponse = directPart?.functionResponse?.response as any
        let responseText = ''
        if (rawResponse) {
          if (typeof rawResponse === 'string') {
            responseText = rawResponse
            try {
              const parsed = JSON.parse(rawResponse)
              if (parsed && parsed.message) responseText = parsed.message
            } catch {}
          } else if (rawResponse.message) {
            responseText = rawResponse.message
          } else {
            responseText = JSON.stringify(rawResponse)
          }
        }
        
        // Mock a final response to complete immediately
        const mockResponse = {
          candidates: [{
            content: {
              role: 'model',
              parts: [{ text: responseText }]
            }
          }]
        } as unknown as GenerateContentResponse
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
        systemInstruction: dynamicInstruction,
        tools: toolsConfig,
      })

      const stepUsage = response.usageMetadata
      if (stepUsage) {
        totalInputTokens += stepUsage.promptTokenCount || 0
        totalOutputTokens += stepUsage.candidatesTokenCount || 0
      }
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
    let cost = 0
    const executedTool = this.tools.find((t: IChatTool): boolean => t.name === call.name)
    if (executedTool && executedTool.creditCost) {
      cost = executedTool.creditCost
    }
    this.executedTools.push({ name: call.name, credits: cost })
    return { responsePayload, cost }
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
          response: responsePayload as Record<string, unknown>,
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
        content: JSON.stringify(responsePayload),
      })
    }
    return { usageCount, credits }
  }

  // ==========================================
  // Firestore Persistence & Memories
  // ==========================================

  private async loadHistoryFromFirestore(): Promise<void> {
    if (this.history.length > 0) {
      return
    }
    try {
      const snapshot = await db.collection('chats').where('user_id', '==', this.userId).get()

      const docs = snapshot.docs.sort((a, b) => {
        const t1 = a.data().created_at?.toDate?.()?.getTime() || 0
        const t2 = b.data().created_at?.toDate?.()?.getTime() || 0
        return t1 - t2
      })

      if (docs.length <= ChatAgent.HISTORY_WINDOW) {
        this.history = docs.map((doc) => {
          const data = doc.data()
          return {
            role: data.sender_id === 'bot' ? ('model' as const) : ('user' as const),
            parts: [{ text: (data.message as string) || '' }],
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
          parts: [{ text: (data.message as string) || '' }],
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
          return `${speaker}: ${(data.message as string) || ''}`
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

  private async saveConversationTurn(
    message: string,
    responseText: string,
    usage?: {
      inputTokens: number
      outputTokens: number
      totalTokens: number
      llmCredits: number
      toolCredits: number
      creditsUsed: number
      tools: Array<{ name: string; credits: number }>
    },
  ): Promise<void> {
    try {
      await db.collection('chats').add({
        user_id: this.userId,
        sender_id: this.userId,
        message,
        created_at: getUtcTime().toDate(),
      })
      await db.collection('chats').add({
        user_id: this.userId,
        sender_id: 'bot',
        message: responseText,
        created_at: getUtcTime().toDate(),
        ...(usage
          ? {
              input_tokens: usage.inputTokens,
              output_tokens: usage.outputTokens,
              total_tokens: usage.totalTokens,
              llm_credits: usage.llmCredits,
              tool_credits: usage.toolCredits,
              credits_used: usage.creditsUsed,
              tools: usage.tools,
            }
          : {}),
      })

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
      logger.error(error, 'Failed to save conversation turn and deduct credits to Firestore')
    }
  }

  private async loadMemoriesFromFirestore(): Promise<string> {
    try {
      const doc = await db.collection('user_memories').doc(this.userId).get()
      if (doc.exists) {
        const data = doc.data()
        const memories = (data?.memories || {}) as Record<string, string>
        const keys = Object.keys(memories)
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

  private async getDynamicInstruction(context?: IChatContext): Promise<string> {
    const nowStr = getLocalTime().format('YYYY-MM-DDTHH:mm:ssZ')
    let memoriesText = ''
    if (this.persistMemory) {
      memoriesText = await this.loadMemoriesFromFirestore()
    }

    // Dynamic User Profile Injection
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

    // Dynamic Task-specific Skill Guideline Injection
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

    // Compose: Persona → System Instruction → User Profile → Memories → Active Task Skills → Current Time
    return `${this.persona}\n\n${this.systemInstruction}${userProfileText}${memoriesText}${taskSkillsText}\n\nCurrent Thai local time is ${nowStr}.`
  }

  private hasFunctionCalls(response: GenerateContentResponse): boolean {
    return !!response.candidates?.[0]?.content?.parts?.some((part) => !!part.functionCall)
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
