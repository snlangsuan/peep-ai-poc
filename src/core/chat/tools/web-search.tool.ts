import { envVariables } from '#/factory'

import type { IChatContext, IChatTool } from '#/core/chat/chat.type'

export class WebSearchTool implements IChatTool {
  readonly name = 'web_search'
  readonly description = 'ค้นหาข้อมูลจากอินเทอร์เน็ต เพื่ออัปเดตข้อมูล ข่าวสาร หรือประเด็นความรู้อื่นๆ ที่เกิดขึ้นล่าสุด'
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
    const baseUrl = envVariables.SEARXNG_BASE_URL.replace(/\/$/, '')
    const url = `${baseUrl}/search?q=${encodeURIComponent(args.query)}&format=json`
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
