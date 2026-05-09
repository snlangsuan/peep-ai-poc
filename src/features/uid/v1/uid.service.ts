import { v4 as uuidv4 } from 'uuid'
import type { UidRepository } from '#/features/uid/v1/uid.repository'

export class UidService {
  constructor(private readonly uidRepository: UidRepository) {}

  async generate(prefix?: string, display_name?: string): Promise<{ id: string; credits: number }> {
    const id = uuidv4()
    const fullId = prefix ? `${prefix}_${id}` : id

    if (display_name) {
      await this.uidRepository.saveProfile(fullId, display_name)
    }

    return { id: fullId, credits: 100 }
  }

  async getProfile(id: string) {
    return this.uidRepository.getProfile(id)
  }

  async deductCredit(id: string, amount: number = 1) {
    return this.uidRepository.deductCredit(id, amount)
  }
}
