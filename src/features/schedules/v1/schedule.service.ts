import type { ScheduleRepository } from '#/features/schedules/v1/schedule.repository'
import type {
  TCreateSchedule,
  TScheduleListFilter,
  TScheduleListResponse,
  TScheduleResponse,
} from '#/features/schedules/v1/schedule.type'

export class ScheduleService {
  constructor(private readonly scheduleRepository: ScheduleRepository) {}

  async create(user_id: string, data: TCreateSchedule): Promise<TScheduleResponse> {
    return this.scheduleRepository.create(user_id, data)
  }

  async list(user_id: string, filter: TScheduleListFilter): Promise<TScheduleListResponse> {
    return this.scheduleRepository.list(user_id, filter)
  }

  async get(user_id: string, id: string): Promise<TScheduleResponse | null> {
    return this.scheduleRepository.getById(user_id, id)
  }

  async update(user_id: string, id: string, data: Partial<TCreateSchedule>): Promise<TScheduleResponse | null> {
    return this.scheduleRepository.update(user_id, id, data)
  }

  async delete(user_id: string, id: string): Promise<boolean> {
    return this.scheduleRepository.delete(user_id, id)
  }

  async listPendingSchedules(): Promise<TScheduleResponse[]> {
    return this.scheduleRepository.listPending()
  }

  async markAsNotified(id: string): Promise<void> {
    await this.scheduleRepository.markAsNotified(id)
  }
}
