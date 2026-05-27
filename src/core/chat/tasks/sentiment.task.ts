import type { IChatContext, IChatTask } from '~/src/core/chat/chat.type'

export class SentimentTask implements IChatTask {
  readonly name = 'chat-sentiment'
  readonly skill = 'sentiment'
  readonly skillInstruction = 'Speak in a tone that reflects the user\'s detected sentiment. If user sentiment is negative, speak with deep empathy, extra politeness, and offer a warm comforting response.'

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
