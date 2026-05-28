import { getUUID } from '#/common/utils/helper.util'
import { chatResponseSchema } from '#/features/chats/v1/chat.schema'

import type { TChatRawResponse, TChatResponse } from '#/features/chats/v1/chat.type'

export function mapRawChatToResponse(item: TChatRawResponse): TChatResponse {
  let content: TChatResponse['content'] = [
    {
      type: 'text' as const,
      text: item.message || '',
    },
  ]

  if (item.message) {
    const msgStr = item.message.trim()
    if (msgStr.startsWith('{') && msgStr.endsWith('}')) {
      try {
        const parsed = JSON.parse(msgStr)
        if (parsed.type === 'action' && typeof parsed.link === 'string') {
          content = [
            {
              type: 'action' as const,
              link: parsed.link,
            },
          ]
        } else if (parsed.type === 'mood_card' && Array.isArray(parsed.options)) {
          content = [
            {
              type: 'mood_card' as const,
              options: parsed.options,
              selected_mood: parsed.selected_mood ?? null,
            },
          ]
        }
      } catch {}
    } else if (msgStr.startsWith('peep://')) {
      content = [
        {
          type: 'action' as const,
          link: msgStr,
        },
      ]
    }
  }

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
    error: item.error ?? null,
  })
}
