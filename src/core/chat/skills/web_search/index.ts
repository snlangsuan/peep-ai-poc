import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { WebSearchTool } from '#/core/chat/tools/web-search.tool'
import { parseSkillManifest, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createWebSearchSkill(): IChatSkill {
  const manifest = parseSkillManifest(join(__dirname, 'skill.md'))
  return buildSkillFromManifest(manifest, [new WebSearchTool()])
}
