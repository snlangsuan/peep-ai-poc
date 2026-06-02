import skillMd from './skill.md' with { type: 'text' }

import { WebSearchTool } from '#/core/chat/tools/web-search.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createWebSearchSkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'web_search/skill.md')
  return buildSkillFromManifest(manifest, [new WebSearchTool()])
}
