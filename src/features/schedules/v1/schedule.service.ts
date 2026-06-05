import InsufficientPermissionException from '#/common/exceptions/insufficient.permission.exception'
import ObjectNotFoundException from '#/common/exceptions/object.not.found.exception'
import { getUtcTime } from '#/common/utils/datetime.util'
import { getUUID } from '#/common/utils/helper.util'

import type { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import type {
  TScheduleCreatePayload,
  TScheduleResponse,
  TScheduleUpdatePayload,
  TScheduleFilterPayload,
  TScheduleItemResponse,
  TScheduleCreateInput,
} from '#/features/schedules/v1/schedule.type'

export class ScheduleService {
  private repository: ScheduleRepository

  constructor(repository: ScheduleRepository) {
    this.repository = repository
  }

  async create(userId: string, input: TScheduleCreatePayload): Promise<TScheduleResponse> {
    const uuid = getUUID()
    const now = getUtcTime().toISOString()

    const newSchedule: TScheduleCreateInput = {
      uuid,
      user_id: userId,
      type: input.type ?? 'calendar',
      scheduled_at: input.scheduled_at,
      end_at: input.end_at ?? null,
      before_sent_at: null,
      sent_at: null,
      repeat: input.repeat ?? null,
      payload: {
        message: input.title,
        type: 'user_schedule',
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        invitees: input.invitees ?? null,
        note: input.note ?? null,
      },
      created_at: now,
      updated_at: now,
    }

    await this.repository.create(newSchedule)

    return {
      uuid: newSchedule.uuid,
      userId: newSchedule.user_id,
      type: newSchedule.type,
      scheduled_at: newSchedule.scheduled_at,
      end_at: newSchedule.end_at ?? null,
      before_sent_at: null,
      sent_at: null,
      repeat: newSchedule.repeat ?? null,
      payload: {
        message: newSchedule.payload.message,
        type: newSchedule.payload.type,
        title: newSchedule.payload.title,
        description: newSchedule.payload.description ?? null,
        location: newSchedule.payload.location ?? null,
        invitees: newSchedule.payload.invitees ?? null,
        note: newSchedule.payload.note ?? null,
      },
      createdAt: newSchedule.created_at,
      updatedAt: newSchedule.updated_at,
    }
  }

  /**
   * Returns the user's existing schedules whose time range overlaps the given
   * one. A schedule without `end_at` is treated as a single point in time.
   * Times are compared as absolute instants (ISO/UTC).
   */
  async findOverlapping(userId: string, scheduledAt: string, endAt?: string | null): Promise<TScheduleResponse[]> {
    const newStart = new Date(scheduledAt).getTime()
    if (Number.isNaN(newStart)) return []
    const newEnd = endAt ? new Date(endAt).getTime() : newStart

    const { data } = await this.repository.findByUserId(userId)
    return data.filter((s) => {
      const exStart = new Date(s.scheduled_at).getTime()
      if (Number.isNaN(exStart)) return false
      const exEnd = s.end_at ? new Date(s.end_at).getTime() : exStart
      // Ranges overlap when they strictly intersect; equal start times (e.g. two
      // point events at the same moment) are also treated as a conflict.
      return (newStart < exEnd && exStart < newEnd) || newStart === exStart
    })
  }

  async getSchedule(userId: string, uuid: string): Promise<TScheduleResponse> {
    const schedule = await this.repository.findById(uuid)

    if (!schedule) {
      throw new ObjectNotFoundException('Schedule not found.')
    }

    if (schedule.userId !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this schedule.')
    }

    return {
      uuid: schedule.uuid,
      userId: schedule.userId,
      type: schedule.type,
      scheduled_at: schedule.scheduled_at,
      end_at: schedule.end_at ?? null,
      before_sent_at: schedule.before_sent_at ?? null,
      sent_at: schedule.sent_at ?? null,
      repeat: schedule.repeat ?? null,
      payload: {
        message: schedule.payload.message,
        type: schedule.payload.type,
        title: schedule.payload.title,
        description: schedule.payload.description ?? null,
        location: schedule.payload.location ?? null,
        invitees: schedule.payload.invitees ?? null,
        note: schedule.payload.note ?? null,
      },
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
    }
  }

  async getSchedules(userId: string, filter?: Partial<TScheduleFilterPayload>): Promise<TScheduleItemResponse> {
    const { data, total } = await this.repository.findByUserId(userId, filter)
    const limit = filter?.limit ?? 25
    const page = filter?.page ?? 1

    return {
      items: data.map((schedule) => ({
        uuid: schedule.uuid,
        userId: schedule.userId,
        type: schedule.type,
        scheduled_at: schedule.scheduled_at,
        end_at: schedule.end_at ?? null,
        before_sent_at: schedule.before_sent_at ?? null,
        sent_at: schedule.sent_at ?? null,
        repeat: schedule.repeat ?? null,
        payload: {
          message: schedule.payload.message,
          type: schedule.payload.type,
          title: schedule.payload.title,
          description: schedule.payload.description ?? null,
          location: schedule.payload.location ?? null,
          invitees: schedule.payload.invitees ?? null,
          note: schedule.payload.note ?? null,
        },
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
      })),
      metadata: {
        total,
        count: data.length,
        page,
        limit,
      },
    }
  }

  async update(userId: string, uuid: string, input: TScheduleUpdatePayload): Promise<TScheduleResponse> {
    const schedule = await this.repository.findById(uuid)

    if (!schedule) {
      throw new ObjectNotFoundException('Schedule not found.')
    }

    if (schedule.userId !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this schedule.')
    }

    const fields: Partial<TScheduleCreateInput> = {
      updated_at: getUtcTime().toISOString(),
    }

    if (input.scheduled_at !== undefined) {
      fields.scheduled_at = input.scheduled_at
      if (getUtcTime(input.scheduled_at).isAfter(getUtcTime())) {
        fields.before_sent_at = null
        fields.sent_at = null
      }
    }

    if (input.end_at !== undefined) {
      fields.end_at = input.end_at
    }

    if (input.repeat !== undefined) {
      fields.repeat = input.repeat
    }

    if (input.type !== undefined) {
      fields.type = input.type
    }

    const mergedTitle = input.title !== undefined ? input.title : schedule.payload.title
    const mergedDescription = input.description !== undefined ? input.description : schedule.payload.description
    const mergedLocation = input.location !== undefined ? input.location : schedule.payload.location
    const mergedInvitees = input.invitees !== undefined ? input.invitees : schedule.payload.invitees
    const mergedNote = input.note !== undefined ? input.note : schedule.payload.note

    fields.payload = {
      message: mergedTitle,
      type: 'user_schedule',
      title: mergedTitle,
      description: mergedDescription ?? null,
      location: mergedLocation ?? null,
      invitees: mergedInvitees ?? null,
      note: mergedNote ?? null,
    }

    await this.repository.update(uuid, fields)

    const updated = await this.repository.findById(uuid)
    if (!updated) {
      throw new ObjectNotFoundException('Schedule not found after update.')
    }

    return {
      uuid: updated.uuid,
      userId: updated.userId,
      type: updated.type,
      scheduled_at: updated.scheduled_at,
      end_at: updated.end_at ?? null,
      before_sent_at: updated.before_sent_at ?? null,
      sent_at: updated.sent_at ?? null,
      repeat: updated.repeat ?? null,
      payload: {
        message: updated.payload.message,
        type: updated.payload.type,
        title: updated.payload.title,
        description: updated.payload.description ?? null,
        location: updated.payload.location ?? null,
        invitees: updated.payload.invitees ?? null,
        note: updated.payload.note ?? null,
      },
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }
  }

  async delete(userId: string, uuid: string): Promise<void> {
    const schedule = await this.repository.findById(uuid)

    if (!schedule) {
      throw new ObjectNotFoundException('Schedule not found.')
    }

    if (schedule.userId !== userId) {
      throw new InsufficientPermissionException('You do not have permission to access this schedule.')
    }

    await this.repository.delete(uuid)
  }
}
