import { db } from '#/common/libs/firebase.lib'

export class UidRepository {
  private readonly collection = db.collection('profiles')

  async saveProfile(id: string, display_name?: string): Promise<void> {
    if (!display_name) return

    const current = new Date()
    const doc = await this.collection.doc(id).get()
    
    // Set initial credits if it's a new profile
    const initialData = doc.exists ? {} : { credits: 100 }

    await this.collection.doc(id).set(
      {
        id,
        display_name,
        ...initialData,
        updated_at: current,
        created_at: doc.exists ? doc.data()?.created_at : current,
      },
      { merge: true },
    )
  }

  async getProfile(id: string): Promise<{ id: string; display_name: string; credits: number } | null> {
    const doc = await this.collection.doc(id).get()
    if (!doc.exists) return null
    const data = doc.data()
    return {
      id: data?.id,
      display_name: data?.display_name,
      credits: data?.credits ?? 0,
    } as any
  }

  async deductCredit(id: string, amount: number = 1): Promise<void> {
    const docRef = this.collection.doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return

    const currentCredits = doc.data()?.credits ?? 0
    await docRef.update({
      credits: Math.max(0, currentCredits - amount),
      updated_at: new Date(),
    })
  }
}
