import { db } from '#/common/libs/firebase.lib'
import type {
  TSendMessage,
  TChatListFilter,
  TChatResponse,
  TChatListResponse,
  TChatResponseWithContent,
} from '#/features/chats/v1/chat.type'

export class ChatRepository {
  private readonly collection = db.collection('chats')

  /**
   * Send a message to a specific room (user's ID)
   * @param room_id The ID of the user whose chat room this belongs to
   * @param sender_id The ID of the sender (either the user's ID or 'bot')
   * @param data The message data
   */
  async send(room_id: string, sender_id: string, data: TSendMessage): Promise<TChatResponse> {
    const docRef = this.collection.doc()
    const now = new Date()

    const chatData = {
      id: docRef.id,
      room_id,
      sender_id,
      message: data.message,
      created_at: now,
    }

    await docRef.set(chatData)
    return chatData
  }

  async list(user_id: string, filter: TChatListFilter): Promise<TChatListResponse> {
    const { page, limit } = filter

    // Query messages in the user's implicit room
    const baseQuery = this.collection.where('room_id', '==', user_id)

    // Get total count
    const countSnapshot = await baseQuery.count().get()
    const total = countSnapshot.data().count

    const snapshot = await baseQuery
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit)
      .get()

    const items: TChatResponseWithContent[] = snapshot.docs.map((doc) => {
      const data = doc.data()
      return {
        id: data.id,
        sender_id: data.sender_id,
        message: data.message,
        created_at: data.created_at?.toDate(),
      }
    })

    return {
      metadata: {
        total,
        count: items.length,
        page,
        limit,
      },
      items,
    }
  }

  onNewMessage(user_id: string, callback: (message: TChatResponseWithContent) => void): () => void {
    const startTime = new Date(Date.now() - 1000) // 1 second buffer
    const query = this.collection
      .where('room_id', '==', user_id)
      .where('created_at', '>', startTime)
      .orderBy('created_at', 'desc')

    return query.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data()
          callback({
            id: data.id,
            sender_id: data.sender_id,
            message: data.message,
            created_at: data.created_at?.toDate(),
          })
        }
      })
    })
  }
}
