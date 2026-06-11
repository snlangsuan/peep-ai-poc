import { db } from '#/common/libs/firebase.lib'
import { logger } from '#/common/libs/logger.lib'

import type { GenerateContentResponse } from '@google/genai'

/**
 * Central ledger for LLM token usage of BACKGROUND / auxiliary calls
 * (intent parsing, monthly summaries, memory extraction, horoscopes, ...).
 *
 * IMPORTANT: usage that belongs to a chat reply must NOT be logged here — it is
 * persisted on the chat document itself (see ChatAgent.saveBotMessage and the
 * mood-card helper). This collection is purely for cost accounting of work that
 * has no chat record to attach to.
 */
export const LLM_USAGE_LOG_COLLECTION = 'llm_usage_log'

/** Attribution for a single auxiliary LLM call. `source` is required so every row is traceable. */
export interface ILlmUsageMeta {
  /** Logical origin of the call, e.g. 'parser', 'summary', 'horoscope'. */
  source: string
  /** Finer-grained label within a source, e.g. 'classify', 'monthly-insight', a zodiac key. */
  kind?: string
  /** End user the call was made on behalf of, when known (background content has none). */
  userId?: string
}

export interface ILlmUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** Pulls token counts out of a Gemini response, defaulting missing fields to 0. */
export function extractGeminiUsage(response: GenerateContentResponse): ILlmUsage {
  const inputTokens = response.usageMetadata?.promptTokenCount ?? 0
  const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0
  const totalTokens = response.usageMetadata?.totalTokenCount ?? inputTokens + outputTokens
  return { inputTokens, outputTokens, totalTokens }
}

/**
 * Records one usage row in the central ledger. Never throws — a logging failure
 * must never break the LLM operation that produced it.
 */
export async function logLlmUsage(params: { meta: ILlmUsageMeta; model: string; usage: ILlmUsage }): Promise<void> {
  try {
    await db.collection(LLM_USAGE_LOG_COLLECTION).add({
      source: params.meta.source,
      kind: params.meta.kind ?? null,
      user_id: params.meta.userId ?? null,
      model: params.model,
      input_tokens: params.usage.inputTokens,
      output_tokens: params.usage.outputTokens,
      total_tokens: params.usage.totalTokens,
      created_at: new Date(),
    })
  } catch (error) {
    logger.warn({ error, meta: params.meta }, '[usage-logger] failed to persist LLM usage')
  }
}
