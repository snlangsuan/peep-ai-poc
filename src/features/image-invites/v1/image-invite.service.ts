import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

import type { ImageInviteRepository } from '#/features/image-invites/v1/image-invite.repository'
import type {
  IImageCodeEntity,
  IImageInviteEntity,
  TImageCodeCreatePayload,
  TImageCodeFilterPayload,
  TImageCodeListResponse,
  TImageCodeResponse,
  TImageInviteCreatePayload,
  TImageInviteResponse,
} from '#/features/image-invites/v1/image-invite.type'

export class ImageInviteService {
  private repository: ImageInviteRepository

  constructor(repository: ImageInviteRepository) {
    this.repository = repository
  }

  /** Generates and persists a new invite code (admin action). */
  async generateCode(createdBy: string, body: TImageCodeCreatePayload): Promise<TImageCodeResponse> {
    const entity: IImageCodeEntity = {
      uuid: getUUID(),
      code: this.generateCodeValue(),
      limit: body.limit,
      count: 0,
      disabled: false,
      created_by: createdBy,
      created_at: getUtcTime().toISOString(),
    }
    const created = await this.repository.createCode(entity)
    return { code: created.code, limit: created.limit }
  }

  /** Lists generated codes for the admin dashboard, with aggregated token usage. */
  async listCodes(filter: TImageCodeFilterPayload): Promise<TImageCodeListResponse> {
    const { page, limit } = filter
    const { data, total } = await this.repository.listCodes(page, limit)
    const usageByCode = await this.repository.sumUsageByCodeUuids(data.map((code) => code.uuid))

    return {
      items: data.map((code) => ({
        uuid: code.uuid,
        code: code.code,
        limit: code.limit,
        count: code.count,
        disabled: code.disabled,
        usage: usageByCode.get(code.uuid) ?? { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        created_by: code.created_by,
        created_at: code.created_at,
      })),
      metadata: { total, count: data.length, page, limit },
    }
  }

  /**
   * Exchanges a valid code for an access token. Rejects unknown/disabled codes (403).
   * Idempotent: a code maps to exactly one token, so repeated exchanges return the
   * token issued the first time.
   */
  async invite(body: TImageInviteCreatePayload): Promise<TImageInviteResponse> {
    const code = await this.repository.findCodeByCode(body.code)
    if (!code) {
      throw new InsufficientPermissionException('Invalid invite code.')
    }
    if (code.disabled) {
      throw new InsufficientPermissionException('Invite code is disabled.')
    }

    // 1 code = 1 token: return the existing token if this code was already exchanged.
    const existing = await this.repository.findInviteByCodeUuid(code.uuid)
    if (existing) {
      return { token: existing.token }
    }

    const entity: IImageInviteEntity = {
      uuid: getUUID(),
      token: this.generateToken(),
      code: code.code,
      code_uuid: code.uuid,
      created_at: getUtcTime().toISOString(),
    }
    const created = await this.repository.createInvite(entity)
    return { token: created.token }
  }

  /** Short, human-friendly invite code (8 uppercase alphanumerics). */
  private generateCodeValue(): string {
    return getUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  }

  /** Opaque, hard-to-guess token (two concatenated UUIDs, dashless). */
  private generateToken(): string {
    return `${getUUID()}${getUUID()}`.replace(/-/g, '')
  }
}
