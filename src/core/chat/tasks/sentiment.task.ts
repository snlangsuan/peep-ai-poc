import type { IChatContext, IChatTask } from '#/core/chat/chat.type'

export class SentimentTask implements IChatTask {
  readonly name = 'chat-sentiment'

  async execute(context: IChatContext): Promise<void> {
    const text = context.message.toLowerCase()
    const positiveWords = ['ดีใจ', 'มีความสุข', 'รัก', 'love', 'สดชื่น', 'happy']
    const negativeWords = ['เศร้า', 'โกรธ', 'เสียใจ', 'แย่', 'sad', 'โกรธ']

    let score = 0

    for (const word of positiveWords) {
      if (text.includes(word)) {
        score++
      }
    }

    for (const word of negativeWords) {
      if (text.includes(word)) {
        score--
      }
    }

    let sentiment = 'neutral'
    if (score > 0) {
      sentiment = 'positive'
    } else if (score < 0) {
      sentiment = 'negative'
    }

    context.metadata.sentiment = sentiment
  }
}
