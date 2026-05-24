import { db } from '#/common/libs/firebase.lib'
import { getUtcTime } from '#/common/utils/datetime.util'

import type { IUserCreateInput } from '#/features/users/v1/user.type'
import type admin from 'firebase-admin'

export class UserRepository {
  async findByUsername(username: string): Promise<admin.firestore.DocumentData | null> {
    const querySnapshot = await db.collection('users').where('username', '==', username).limit(1).get()

    if (querySnapshot.empty) {
      return null
    }

    const doc = querySnapshot.docs[0]
    if (!doc) {
      return null
    }

    return doc.data()
  }

  async findByApiKey(apiKey: string): Promise<admin.firestore.DocumentData | null> {
    const querySnapshot = await db.collection('users').where('apiKey', '==', apiKey).limit(1).get()

    if (querySnapshot.empty) {
      return null
    }

    const doc = querySnapshot.docs[0]
    if (!doc) {
      return null
    }

    return doc.data()
  }

  async findById(uuid: string): Promise<admin.firestore.DocumentData | null> {
    const doc = await db.collection('users').doc(uuid).get()
    if (!doc.exists) {
      return null
    }
    return doc.data() || null
  }

  async create(input: IUserCreateInput): Promise<void> {
    await db
      .collection('users')
      .doc(input.uuid)
      .set({
        uuid: input.uuid,
        username: input.username,
        password: input.passwordHash,
        apiKey: input.apiKey,
        credit: input.credit ?? 100,
        createdAt: getUtcTime().toISOString(),
      })
  }

  async addCredits(uuid: string, amount: number): Promise<number> {
    const docRef = db.collection('users').doc(uuid)
    let newCredit = amount
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef)
      const current = doc.data()?.credit ?? 100
      newCredit = current + amount
      transaction.update(docRef, { credit: newCredit })
    })
    return newCredit
  }
}
