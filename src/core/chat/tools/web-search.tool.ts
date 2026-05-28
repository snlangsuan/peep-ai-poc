import { envVariables } from '#/factory'

import type { IChatContext, IChatTool } from '~/src/core/chat/chat.type'

export class WebSearchTool implements IChatTool {
  readonly name = 'web_search'
  readonly description =
    'ค้นหาข้อมูลแบบเรียลไทม์จากอินเทอร์เน็ต ใช้บังคับสำหรับทุกคำถามที่ต้องการข้อมูลปัจจุบันหรือที่โมเดลไม่สามารถตอบได้จากข้อมูลฝึกฝน เช่น สภาพอากาศปัจจุบัน อุณหภูมิ พยากรณ์อากาศ ข่าววันนี้ ราคาสินค้า/หุ้น/เงินดิจิทัล อัตราแลกเปลี่ยน เหตุการณ์ล่าสุด คะแนนกีฬา ตารางหนัง หรือข้อมูลใดๆ ที่ต้องเป็นปัจจุบัน'
  readonly allowDirectInvoke = false
  readonly parameters = {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description: 'คำหรือข้อความที่ต้องการค้นหาบนอินเทอร์เน็ต',
      },
    },
    required: ['query'],
  }

  async execute(args: { query: string }, context: IChatContext): Promise<string> {
    const baseUrl = envVariables.WEB_SEARCH_API_URL.replace(/\/$/, '')
    const url = `${baseUrl}?q=${encodeURIComponent(args.query)}`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Search service returned status ${response.status}`)
      }

      const data = await response.json()
      return JSON.stringify({
        source: 'Peep Search Engine Service',
        query: args.query,
        timestamp: new Date().toISOString(),
        results: data.results || data,
      })
    } catch (error) {
      return JSON.stringify({
        error: `Failed to fetch search results from Peep Search Engine: ${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
}
