import type { HoroscopeRepository } from '#/features/horoscopes/v1/horoscope.repository'
import type { THoroscopeResponse } from '#/features/horoscopes/v1/horoscope.type'

export class HoroscopeService {
  private repository: HoroscopeRepository

  constructor(repository: HoroscopeRepository) {
    this.repository = repository
  }

  async getByDate(date: string, signKey?: string): Promise<THoroscopeResponse[]> {
    return this.repository.listByDate(date, signKey)
  }
}
