import { logger } from '#/common/libs/logger.lib'

import type { TChatSseEvent } from '#/features/chats/v1/chat.type'

type TSseHandler = (event: TChatSseEvent) => void

class SseBroker {
  private subscribers: Map<string, Set<TSseHandler>> = new Map()

  subscribe(userId: string, handler: TSseHandler): () => void {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Set())
    }
    this.subscribers.get(userId)!.add(handler)
    logger.info(
      { userId, subscriberCount: this.subscribers.get(userId)!.size },
      '[sse-broker] subscriber added',
    )

    return () => {
      const set = this.subscribers.get(userId)
      if (set) {
        set.delete(handler)
        if (set.size === 0) {
          this.subscribers.delete(userId)
        }
        logger.info(
          { userId, remaining: set.size },
          '[sse-broker] subscriber removed',
        )
      }
    }
  }

  emit(userId: string, event: TChatSseEvent): void {
    const handlers = this.subscribers.get(userId)
    const subscriberCount = handlers?.size ?? 0
    logger.info(
      { userId, eventType: event.type, subscriberCount },
      subscriberCount === 0
        ? '[sse-broker] emit DROPPED — no active subscriber for this userId'
        : '[sse-broker] emit delivered to subscribers',
    )
    if (!handlers) return
    for (const handler of handlers) {
      handler(event)
    }
  }

  /** Number of active SSE connections for a user (0 means an emit would be dropped). */
  subscriberCount(userId: string): number {
    return this.subscribers.get(userId)?.size ?? 0
  }
}

export const sseBroker = new SseBroker()
