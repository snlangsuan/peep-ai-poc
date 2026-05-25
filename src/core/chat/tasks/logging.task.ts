import { logger } from '#/common/libs/logger.lib'

import type { IChatContext, IChatTask } from '~/src/core/chat/chat.type'

export class LoggingTask implements IChatTask {
  readonly name = 'chat-logging'

  async execute(context: IChatContext): Promise<void> {
    logger.info({ userId: context.userId, messageLength: context.message.length }, '💬 Chat pipeline request received')
  }
}
