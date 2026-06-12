import { db } from '#/common/libs/firebase.lib'
import { getUtcTime } from '#/common/utils/datetime.util'

import type { IAccountMonthEntity } from '#/features/account/v1/account.type'
import type admin from 'firebase-admin'

const COLLECTION = 'account_months'

export class AccountRepository {
  private docId(userId: string, month: string): string {
    return `${userId}_${month}`
  }

  /** All month docs for a user. The set is small (one per active month), so an in-memory walk is fine. */
  async listByUser(userId: string): Promise<IAccountMonthEntity[]> {
    const snapshot = await db.collection(COLLECTION).where('user_id', '==', userId).get()
    return snapshot.docs.map((d) => this.mapToEntity(d.data()))
  }

  async findByMonth(userId: string, month: string): Promise<IAccountMonthEntity | null> {
    const doc = await db.collection(COLLECTION).doc(this.docId(userId, month)).get()
    if (!doc.exists) return null
    const data = doc.data()
    if (!data) return null
    return this.mapToEntity(data)
  }

  /** Upsert the opening-balance override (anchor) for a month, preserving any existing budget. */
  async setOpeningOverride(userId: string, month: string, openingOverride: number | null): Promise<void> {
    await db.collection(COLLECTION).doc(this.docId(userId, month)).set(
      {
        user_id: userId,
        month,
        opening_override: openingOverride,
        updated_at: getUtcTime().toISOString(),
      },
      { merge: true },
    )
  }

  /** Upsert the monthly budget for a month, preserving any existing override. */
  async setBudget(userId: string, month: string, budget: number | null): Promise<void> {
    await db.collection(COLLECTION).doc(this.docId(userId, month)).set(
      {
        user_id: userId,
        month,
        budget,
        updated_at: getUtcTime().toISOString(),
      },
      { merge: true },
    )
  }

  private mapToEntity(data: admin.firestore.DocumentData): IAccountMonthEntity {
    return {
      user_id: data.user_id as string,
      month: data.month as string,
      opening_override: typeof data.opening_override === 'number' ? (data.opening_override as number) : null,
      budget: typeof data.budget === 'number' ? (data.budget as number) : null,
      updated_at: (data.updated_at ?? '') as string,
    }
  }
}
