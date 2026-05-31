import { getUUID } from '#/common/utils/helper.util'
import { chatResponseSchema, chatMessageResponseContentSchema } from '#/features/chats/v1/chat.schema'

import type { TChatRawResponse, TChatResponse } from '#/features/chats/v1/chat.type'

function normalizeChatError(
  raw: TChatRawResponse['error'] | string,
): { message: string; stage: string; code?: string } | null {
  if (raw == null) return null
  if (typeof raw === 'string') return { message: raw, stage: 'unknown' }
  return raw
}

function resolveContent(item: TChatRawResponse): TChatResponse['content'] {
  if (Array.isArray(item.content) && item.content.length > 0) {
    const validated = chatMessageResponseContentSchema.array().safeParse(item.content)
    if (validated.success) return validated.data
  }
  return [{ type: 'text' as const, text: '' }]
}

export function mapRawChatToResponse(item: TChatRawResponse): TChatResponse {
  return chatResponseSchema.parse({
    id: item.id || getUUID(),
    sender_id: item.sender_id || 'unknown',
    content: resolveContent(item),
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
    skill_credits: item.skill_credits,
    credits_used: item.credits_used,
    tools: item.tools,
    skills_used: item.skills_used,
    error: normalizeChatError(item.error),
  })
}
