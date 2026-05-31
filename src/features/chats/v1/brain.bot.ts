import type { Tool } from '@google/genai'
import { getLocalTime } from '~/src/common/utils/datetime.util'

export interface BotTask {
  id: string
  name: string
  description: string
  guidelines?: string[]
}

export interface BotTool {
  name: string
  declaration: Tool | any
  handler: (args: any, userId: string) => Promise<any>
}

export class BrainBot {
  private tasks: BotTask[] = []
  private tools: Map<string, BotTool> = new Map()

  registerTask(task: BotTask): this {
    this.tasks.push(task)
    return this
  }

  registerTool(tool: BotTool): this {
    this.tools.set(tool.name, tool)
    return this
  }

  getTools(): Tool[] {
    const geminiTools: Tool[] = []
    const functionDeclarations: any[] = []

    for (const tool of this.tools.values()) {
      const decl = tool.declaration
      if (decl.functionDeclarations) {
        functionDeclarations.push(...decl.functionDeclarations)
      } else if (decl.googleSearch) {
        geminiTools.push(decl)
      } else if (decl.name) {
        // Direct function declaration format
        functionDeclarations.push(decl)
      }
    }

    if (functionDeclarations.length > 0) {
      geminiTools.push({ functionDeclarations } as any)
    }

    return geminiTools
  }

  async executeTool(name: string, args: Record<string, unknown>, userId: string): Promise<any> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`)
    }
    return tool.handler(args, userId)
  }

  buildSystemPrompt(displayName: string, userId: string, referenceDateStr: string): string {
    const taskGoals = this.tasks
      .map((t) => `- ${t.name}: ${t.description}`)
      .join('\n')

    const baseGuidelines = [
      'Be precise with dates. Use "User Message Sent At" as the absolute reference for relative dates like "today", "tomorrow", or "next Monday".',
    ]

    const taskGuidelines: string[] = []
    for (const task of this.tasks) {
      if (task.guidelines) {
        taskGuidelines.push(...task.guidelines)
      }
    }

    const commonEndGuidelines = [
      'If a user message contains multiple items, call the appropriate tools multiple times.',
      'When summarizing, present the tool\'s response exactly as provided.',
      `LANGUAGE COMPLIANCE: You MUST respond in the same language used by the user in their message. Do not switch or mix languages unless the user does. Address the user politely (e.g., using ${displayName || 'คุณ'} for Thai).`,
      'ALWAYS respond in PLAIN TEXT. NO Markdown (no **, _, `, or links). Use \\n for breaks.'
    ]

    const allGuidelines = [...baseGuidelines, ...taskGuidelines, ...commonEndGuidelines]
    const guidelinesStr = allGuidelines
      .map((g, index) => `${index + 1}. ${g}`)
      .join('\n')

    return `You are a helpful AI assistant and an expert data extractor for ${displayName || 'the user'} (ID: ${userId}).

STRICT LANGUAGE RULE: Detect the language used in the user's message and respond EXCLUSIVELY in that same language. If the user writes in English, you MUST respond in English. If the user writes in Thai, you MUST respond in Thai.

Current System Time: ${getLocalTime().format('YYYY-MM-DD HH:mm:ss (Thailand Time)')}
User Message Sent At: ${referenceDateStr}

Your primary goal is to accurately perform these tasks:
${taskGoals}

GUIDELINES:
${guidelinesStr}`
  }
}
