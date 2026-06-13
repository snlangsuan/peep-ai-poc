import { db } from '#/common/libs/firebase.lib'

import type {
  IImageCodeEntity,
  IImageInsightUsageEntity,
  IImageInviteEntity,
  IUsageTotals,
  TConsumeCodeResult,
} from '#/features/image-invites/v1/image-invite.type'
import type admin from 'firebase-admin'

const CODES_COLLECTION = 'image_codes'
const INVITES_COLLECTION = 'image_invites'
const USAGES_COLLECTION = 'image_insight_usages'

export class ImageInviteRepository {
  async createCode(entity: IImageCodeEntity): Promise<IImageCodeEntity> {
    await db.collection(CODES_COLLECTION).doc(entity.uuid).set({
      uuid: entity.uuid,
      code: entity.code,
      limit: entity.limit,
      count: entity.count,
      disabled: entity.disabled,
      created_by: entity.created_by,
      created_at: entity.created_at,
    })
    return entity
  }

  async findCodeByCode(code: string): Promise<IImageCodeEntity | null> {
    const snapshot = await db.collection(CODES_COLLECTION).where('code', '==', code).limit(1).get()
    if (snapshot.empty) return null
    const data = snapshot.docs[0]?.data()
    if (!data) return null
    return this.mapCode(data)
  }

  /** Lists all codes (newest first), paginated. */
  async listCodes(page: number, limit: number): Promise<{ data: IImageCodeEntity[]; total: number }> {
    const snapshot = await db.collection(CODES_COLLECTION).get()
    const codes = snapshot.docs
      .map((doc) => this.mapCode(doc.data()))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

    const total = codes.length
    const offset = (page - 1) * limit
    return { data: codes.slice(offset, offset + limit), total }
  }

  /**
   * Atomically consumes one unit of a code's quota. Returns `ok: false` when the
   * code is missing or its usage limit (when not -1) is already reached; otherwise
   * increments `count` and returns `ok: true`.
   */
  async consumeCode(codeUuid: string): Promise<TConsumeCodeResult> {
    const ref = db.collection(CODES_COLLECTION).doc(codeUuid)
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      const data = snap.data()
      if (!data) return { ok: false, reason: 'not_found', count: 0, limit: 0 }

      const limit = typeof data.limit === 'number' ? data.limit : -1
      const count = typeof data.count === 'number' ? data.count : 0

      if (data.disabled === true) {
        return { ok: false, reason: 'disabled', count, limit }
      }
      if (limit !== -1 && count >= limit) {
        return { ok: false, reason: 'limit', count, limit }
      }

      tx.update(ref, { count: count + 1 })
      return { ok: true, count: count + 1, limit }
    })
  }

  async createInvite(entity: IImageInviteEntity): Promise<IImageInviteEntity> {
    await db.collection(INVITES_COLLECTION).doc(entity.uuid).set({
      uuid: entity.uuid,
      token: entity.token,
      code: entity.code,
      code_uuid: entity.code_uuid,
      created_at: entity.created_at,
    })
    return entity
  }

  async findByToken(token: string): Promise<IImageInviteEntity | null> {
    const snapshot = await db.collection(INVITES_COLLECTION).where('token', '==', token).limit(1).get()
    if (snapshot.empty) return null
    const data = snapshot.docs[0]?.data()
    if (!data) return null
    return this.mapInvite(data)
  }

  async findInviteByUuid(uuid: string): Promise<IImageInviteEntity | null> {
    const doc = await db.collection(INVITES_COLLECTION).doc(uuid).get()
    if (!doc.exists) return null
    const data = doc.data()
    if (!data) return null
    return this.mapInvite(data)
  }

  /** Returns the existing invite for a code, if one was already issued (1 code = 1 token). */
  async findInviteByCodeUuid(codeUuid: string): Promise<IImageInviteEntity | null> {
    const snapshot = await db.collection(INVITES_COLLECTION).where('code_uuid', '==', codeUuid).limit(1).get()
    if (snapshot.empty) return null
    const data = snapshot.docs[0]?.data()
    if (!data) return null
    return this.mapInvite(data)
  }

  /** Sums token usage per code for the given code uuids (chunked `in` queries). */
  async sumUsageByCodeUuids(codeUuids: string[]): Promise<Map<string, IUsageTotals>> {
    const totals = new Map<string, IUsageTotals>()
    if (codeUuids.length === 0) return totals

    for (let i = 0; i < codeUuids.length; i += 10) {
      const chunk = codeUuids.slice(i, i + 10)
      const snapshot = await db.collection(USAGES_COLLECTION).where('code_uuid', 'in', chunk).get()
      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        const codeUuid = data.code_uuid as string
        const current = totals.get(codeUuid) ?? { input_tokens: 0, output_tokens: 0, total_tokens: 0 }
        current.input_tokens += Number(data.input_tokens) || 0
        current.output_tokens += Number(data.output_tokens) || 0
        current.total_tokens += Number(data.total_tokens) || 0
        totals.set(codeUuid, current)
      })
    }
    return totals
  }

  async addUsage(entity: IImageInsightUsageEntity): Promise<void> {
    await db.collection(USAGES_COLLECTION).doc(entity.uuid).set({
      uuid: entity.uuid,
      code: entity.code,
      code_uuid: entity.code_uuid,
      invite_uuid: entity.invite_uuid,
      model: entity.model,
      input_tokens: entity.input_tokens,
      output_tokens: entity.output_tokens,
      total_tokens: entity.total_tokens,
      created_at: entity.created_at,
    })
  }

  private mapCode(data: admin.firestore.DocumentData): IImageCodeEntity {
    return {
      uuid: data.uuid as string,
      code: data.code as string,
      limit: typeof data.limit === 'number' ? data.limit : -1,
      count: typeof data.count === 'number' ? data.count : 0,
      disabled: data.disabled === true,
      created_by: data.created_by as string,
      created_at: data.created_at as string,
    }
  }

  private mapInvite(data: admin.firestore.DocumentData): IImageInviteEntity {
    return {
      uuid: data.uuid as string,
      token: data.token as string,
      code: data.code as string,
      code_uuid: (data.code_uuid as string) ?? '',
      created_at: data.created_at as string,
    }
  }
}
