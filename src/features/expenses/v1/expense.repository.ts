import { db } from '#/common/libs/firebase.lib'

import type { IExpenseEntity, TExpenseFilterPayload } from '#/features/expenses/v1/expense.type'
import type admin from 'firebase-admin'

export class ExpenseRepository {
  async findDuplicate(
    createdBy: string,
    subject: string,
    amount: number,
    date: string,
  ): Promise<IExpenseEntity | null> {
    const snapshot = await db
      .collection('expenses')
      .where('created_by', '==', createdBy)
      .where('subject', '==', subject)
      .where('amount', '==', amount)
      .where('date', '==', date)
      .limit(1)
      .get()

    if (snapshot.empty) {
      return null
    }

    const doc = snapshot.docs[0]
    if (!doc) {
      return null
    }

    return this.mapToResponse(doc.data())
  }

  async create(input: IExpenseEntity): Promise<IExpenseEntity> {
    const existing = await this.findDuplicate(input.created_by, input.subject, input.amount, input.date)

    if (existing) {
      return existing
    }

    await db
      .collection('expenses')
      .doc(input.uuid)
      .set({
        uuid: input.uuid,
        created_by: input.created_by,
        subject: input.subject,
        amount: input.amount,
        category: input.category,
        currency: input.currency,
        location: input.location ?? null,
        date: input.date,
        time: input.time ?? null,
        created_at: input.created_at,
        updated_at: input.updated_at,
      })

    return input
  }

  async createMultiple(inputs: IExpenseEntity[]): Promise<IExpenseEntity[]> {
    const results: IExpenseEntity[] = []
    for (const input of inputs) {
      const res = await this.create(input)
      results.push(res)
    }
    return results
  }

  async findById(uuid: string): Promise<IExpenseEntity | null> {
    const doc = await db.collection('expenses').doc(uuid).get()
    if (!doc.exists) {
      return null
    }
    const data = doc.data()
    if (!data) {
      return null
    }
    return this.mapToResponse(data)
  }

  async list(
    userId: string,
    filter: Partial<TExpenseFilterPayload>,
  ): Promise<{ data: IExpenseEntity[]; total: number }> {
    const query = db.collection('expenses').where('created_by', '==', userId)
    const snapshot = await query.get()
    let docs = snapshot.docs.map((d) => this.mapToResponse(d.data()))

    if (filter.start_date) {
      docs = docs.filter((doc) => doc.date >= filter.start_date!)
    }
    if (filter.end_date) {
      docs = docs.filter((doc) => doc.date <= filter.end_date!)
    }

    const total = docs.length

    const sortField = filter.sort || 'date'
    const desc = filter.desc ?? false
    docs.sort((a, b) => {
      const valA = a[sortField as keyof IExpenseEntity]
      const valB = b[sortField as keyof IExpenseEntity]

      if (valA === undefined || valA === null) return desc ? 1 : -1
      if (valB === undefined || valB === null) return desc ? -1 : 1

      if (typeof valA === 'number' && typeof valB === 'number') {
        return desc ? valB - valA : valA - valB
      }

      const strA = String(valA)
      const strB = String(valB)
      return desc ? strB.localeCompare(strA) : strA.localeCompare(strB)
    })

    const limit = filter.limit ?? 25
    const page = filter.page ?? 1
    const offset = (page - 1) * limit
    const paginatedData = docs.slice(offset, offset + limit)

    return {
      data: paginatedData,
      total,
    }
  }

  async update(uuid: string, fields: Partial<IExpenseEntity>): Promise<void> {
    const updateData: Record<string, any> = {
      updated_at: fields.updated_at,
    }

    if (fields.subject !== undefined) {
      updateData.subject = fields.subject
    }
    if (fields.amount !== undefined) {
      updateData.amount = fields.amount
    }
    if (fields.category !== undefined) {
      updateData.category = fields.category
    }
    if (fields.currency !== undefined) {
      updateData.currency = fields.currency
    }
    if (fields.location !== undefined) {
      updateData.location = fields.location ?? null
    }
    if (fields.date !== undefined) {
      updateData.date = fields.date
    }
    if (fields.time !== undefined) {
      updateData.time = fields.time ?? null
    }

    await db.collection('expenses').doc(uuid).update(updateData)
  }

  async delete(uuid: string): Promise<void> {
    await db.collection('expenses').doc(uuid).delete()
  }

  private mapToResponse(data: admin.firestore.DocumentData): IExpenseEntity {
    return {
      uuid: data.uuid as string,
      created_by: data.created_by as string,
      subject: data.subject as string,
      amount: data.amount as number,
      category: (data.category || 'Other') as any,
      currency: (data.currency || 'THB') as string,
      location: (data.location ?? null) as string | null,
      date: data.date as string,
      time: (data.time ?? null) as string | null,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
    }
  }
}
