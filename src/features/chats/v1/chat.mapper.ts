import { getUUID } from '#/common/utils/helper.util'
import { chatResponseSchema } from '#/features/chats/v1/chat.schema'

import type { TChatRawResponse, TChatResponse } from '#/features/chats/v1/chat.type'

function normalizeChatError(
  raw: TChatRawResponse['error'] | string,
): { message: string; stage: string; code?: string } | null {
  if (raw == null) return null
  if (typeof raw === 'string') return { message: raw, stage: 'unknown' }
  return raw
}

function parseStructuredMessage(msgStr: string): TChatResponse['content'] | null {
  if (msgStr.startsWith('peep://')) {
    return [{ type: 'action' as const, link: msgStr }]
  }
  if (!msgStr.startsWith('{') || !msgStr.endsWith('}')) {
    return null
  }
  try {
    const parsed = JSON.parse(msgStr)
    if (parsed.type === 'action' && typeof parsed.link === 'string') {
      return [{ type: 'action' as const, link: parsed.link }]
    }
    if (parsed.type === 'mood_card' && Array.isArray(parsed.options)) {
      return [
        {
          type: 'mood_card' as const,
          options: parsed.options,
          selected_mood: parsed.selected_mood ?? null,
        },
      ]
    }
  } catch {}
  return null
}

export function mapRawChatToResponse(item: TChatRawResponse): TChatResponse {
  const defaultContent: TChatResponse['content'] = [{ type: 'text' as const, text: item.message || '' }]
  const content = item.message
    ? parseStructuredMessage(item.message.trim()) ?? defaultContent
    : defaultContent

  return chatResponseSchema.parse({
    id: item.id || getUUID(),
    sender_id: item.sender_id || 'unknown',
    content,
    created_at:
      typeof item.created_at === 'string'
        ? item.created_at
        : item.created_at?.toISOString() || new Date().toISOString(),
    feedback: item.feedback || null,
    input_tokens: item.input_tokens,
    output_tokens: item.output_tokens,
    total_tokens: item.total_tokens,
    llm_credits: item.llm_credits,
    tool_credits: item.tool_credits,
    credits_used: item.credits_used,
    tools: item.tools,
    error: normalizeChatError(item.error),
  })
}
