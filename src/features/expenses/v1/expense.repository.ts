import { db } from '#/common/libs/firebase.lib'

import type {
  TCreateExpense,
  TExpenseListFilter,
  TExpenseListResponse,
  TExpenseResponse,
} from '#/features/expenses/v1/expense.type'
import { logger } from '#/common/libs/logger.lib'

export class ExpenseRepository {
  private readonly collection = db.collection('expenses')

  async create(user_id: string, data: TCreateExpense): Promise<TExpenseResponse> {
    const now = new Date()

    // Deduplication check
    try {
      const existingSnapshot = await this.collection
        .where('created_by', '==', user_id)
        .where('subject', '==', data.subject)
        .where('amount', '==', data.amount)
        .where('date', '==', data.date)
        .get()

      const firstDoc = existingSnapshot.docs[0]
      if (firstDoc) {
        logger.info('Duplicate expense found, returning existing one')
        const d = firstDoc.data()
        return {
          id: d.id,
          subject: d.subject,
          amount: d.amount,
          currency: d.currency,
          date: d.date,
          location: d.location,
          time: d.time,
          created_by: d.created_by,
          created_at: d.created_at?.toDate(),
          updated_at: d.updated_at?.toDate(),
          _is_duplicate: true,
        } as any
      }
    } catch (dbError) {
      logger.error({ dbError }, 'Error during expense deduplication check')
    }

    const docRef = this.collection.doc()
    const expenseData = {
      id: docRef.id,
      ...data,
      created_by: user_id,
      created_at: now,
      updated_at: now,
    }

    await docRef.set(expenseData)
    return this.mapToResponse(expenseData)
  }

  async list(user_id: string, filter: TExpenseListFilter): Promise<TExpenseListResponse> {
    const { page, limit, start_date, end_date, sort, desc } = filter

    let query = this.collection.where('created_by', '==', user_id)

    if (start_date) {
      query = query.where('date', '>=', start_date)
    }
    if (end_date) {
      query = query.where('date', '<=', end_date)
    }

    // Get total count
    const countSnapshot = await query.count().get()
    const total = countSnapshot.data().count

    const sortField = sort || 'date'
    const orderDirection = desc ? 'desc' : 'asc'

    if ((start_date || end_date) && sortField !== 'date') {
      query = query.orderBy('date', orderDirection)
    }

    const snapshot = await query
      .orderBy(sortField, orderDirection)
      .limit(limit)
      .offset((page - 1) * limit)
      .get()

    const items: TExpenseResponse[] = snapshot.docs.map((doc) => {
      return this.mapToResponse(doc.data())
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

  async getById(user_id: string, id: string): Promise<TExpenseResponse | null> {
    const doc = await this.collection.doc(id).get()
    if (!doc.exists) return null

    const data = doc.data()
    if (data?.created_by !== user_id) return null

    return this.mapToResponse(data)
  }

  async update(user_id: string, id: string, data: Partial<TCreateExpense>): Promise<TExpenseResponse | null> {
    const docRef = this.collection.doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return null

    const existingData = doc.data()
    if (existingData?.created_by !== user_id) return null

    const now = new Date()
    const updateData = {
      ...data,
      updated_at: now,
    }

    await docRef.update(updateData)

    return this.getById(user_id, id)
  }

  async delete(user_id: string, id: string): Promise<boolean> {
    const docRef = this.collection.doc(id)
    const doc = await docRef.get()
    if (!doc.exists) return false

    const data = doc.data()
    if (data?.created_by !== user_id) return false

    await docRef.delete()
    return true
  }

  private mapToResponse(data: any): TExpenseResponse {
    return {
      id: data.id,
      subject: data.subject,
      amount: data.amount,
      currency: data.currency,
      date: data.date,
      location: data.location,
      time: data.time,
      created_by: data.created_by,
      created_at: data.created_at?.toDate ? data.created_at.toDate() : data.created_at,
      updated_at: data.updated_at?.toDate ? data.updated_at.toDate() : data.updated_at,
    } as TExpenseResponse
  }
}
