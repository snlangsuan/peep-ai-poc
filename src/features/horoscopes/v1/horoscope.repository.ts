import { db } from '#/common/libs/firebase.lib'

import type { THoroscopeAspect, THoroscopeResponse } from '#/features/horoscopes/v1/horoscope.type'
import type admin from 'firebase-admin'

const HOROSCOPE_COLLECTION = 'daily_horoscopes'

export class HoroscopeRepository {
  async listByDate(date: string, signKey?: string): Promise<THoroscopeResponse[]> {
    const snapshot = await db.collection(HOROSCOPE_COLLECTION).where('date', '==', date).get()

    let docs = snapshot.docs.map((d) => this.mapToResponse(d.data()))
    if (signKey) {
      docs = docs.filter((d) => d.sign_key === signKey)
    }
    docs.sort((a, b) => a.sign_key.localeCompare(b.sign_key))
    return docs
  }

  private mapToResponse(data: admin.firestore.DocumentData): THoroscopeResponse {
    return {
      date: data.date as string,
      sign_key: data.sign_key as string,
      sign: data.sign as string,
      date_range: data.date_range as string,
      tagline: data.tagline as string,
      lucky_numbers: Array.isArray(data.lucky_numbers) ? (data.lucky_numbers as string[]) : [],
      lucky_color: (data.lucky_color ?? '') as string,
      lucky_time: (data.lucky_time ?? '') as string,
      love: this.mapAspect(data.love),
      finance: this.mapAspect(data.finance),
      work: this.mapAspect(data.work),
      energy: (data.energy ?? '') as string,
      energy_level: typeof data.energy_level === 'number' ? data.energy_level : 0,
    }
  }

  /** Normalizes an aspect that may be an object {reading, caution} or a legacy plain string. */
  private mapAspect(value: unknown): THoroscopeAspect {
    if (typeof value === 'string') return { reading: value }
    if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>
      const reading = typeof o.reading === 'string' ? o.reading : ''
      const caution = typeof o.caution === 'string' && o.caution.trim().length > 0 ? o.caution : undefined
      return caution ? { reading, caution } : { reading }
    }
    return { reading: '' }
  }
}
