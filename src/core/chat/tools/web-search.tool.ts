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

  private static readonly MAX_RESULTS = 5
  private static readonly MAX_SNIPPET_CHARS = 250
  private static readonly MAX_TITLE_CHARS = 150

  async execute(args: { query: string }, context: IChatContext): Promise<string> {
    const baseUrl = envVariables.WEB_SEARCH_API_URL.replace(/\/$/, '')
    const url = `${baseUrl}?q=${encodeURIComponent(args.query)}`
    try {
      const response = await fetch(url)
      if (!response.ok) {
        return JSON.stringify({ error: `Search service returned status ${response.status}` })
      }

      const data = (await response.json()) as {
        results?: Array<{ title?: string; content?: string; url?: string }>
      }
      const results = (data.results || [])
        .slice(0, WebSearchTool.MAX_RESULTS)
        .map((r) => ({
          title: (r.title || '').slice(0, WebSearchTool.MAX_TITLE_CHARS).trim(),
          snippet: (r.content || '').replace(/\s+/g, ' ').slice(0, WebSearchTool.MAX_SNIPPET_CHARS).trim(),
          url: r.url || '',
        }))
        .filter((r) => r.title || r.snippet)

      if (results.length === 0) {
        return JSON.stringify({ error: 'No relevant results found.' })
      }
      return JSON.stringify({ results })
    } catch (error) {
      return JSON.stringify({
        error: `Failed to fetch search results: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
}
