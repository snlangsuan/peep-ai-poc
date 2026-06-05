import { getLocalTime, getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

import type { MoodRepository, TMoodSidClaim } from '#/features/moods/v1/mood.repository'
import type {
  IMoodEntity,
  TEmotion,
  TMoodCreatePayload,
  TMoodFilterPayload,
  TMoodItemResponse,
  TMoodResponse,
} from '#/features/moods/v1/mood.type'

export class MoodService {
  private repository: MoodRepository

  constructor(repository: MoodRepository) {
    this.repository = repository
  }

  async claimMoodSid(sid: string, userId: string, emotion: TEmotion): Promise<TMoodSidClaim> {
    return this.repository.claimMoodSid(sid, userId, emotion)
  }

  async create(userId: string, body: TMoodCreatePayload): Promise<TMoodResponse> {
    const now = getUtcTime().toISOString()
    const date = getLocalTime().format('YYYY-MM-DD')

    const input: IMoodEntity = {
      uuid: getUUID(),
      user_id: userId,
      emotion: body.emotion,
      note: body.note ?? null,
      date,
      created_at: now,
      updated_at: now,
    }
    return this.repository.create(input)
  }

  async getMoods(userId: string, filter: Partial<TMoodFilterPayload>): Promise<TMoodItemResponse> {
    const { data, total } = await this.repository.list(userId, filter)
    const limit = filter.limit ?? 25
    const page = filter.page ?? 1

    return {
      items: data,
      metadata: {
        total,
        count: data.length,
        page,
        limit,
      },
    }
  }
}
