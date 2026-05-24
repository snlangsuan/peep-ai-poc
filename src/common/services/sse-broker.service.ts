import type { TChatSseEvent } from '#/features/chats/v1/chat.type'

type TSseHandler = (event: TChatSseEvent) => void

class SseBroker {
  private subscribers: Map<string, Set<TSseHandler>> = new Map()

  subscribe(userId: string, handler: TSseHandler): () => void {
    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Set())
    }
    this.subscribers.get(userId)!.add(handler)

    return () => {
      const set = this.subscribers.get(userId)
      if (set) {
        set.delete(handler)
        if (set.size === 0) {
          this.subscribers.delete(userId)
        }
      }
    }
  }

  emit(userId: string, event: TChatSseEvent): void {
    const handlers = this.subscribers.get(userId)
    if (!handlers) return
    for (const handler of handlers) {
      handler(event)
    }
  }
}

export const sseBroker = new SseBroker()
