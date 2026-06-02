import skillMd from './skill.md' with { type: 'text' }

import { SummaryTool } from '#/core/chat/tools/summary.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createSummarySkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'summary/skill.md')
  return buildSkillFromManifest(manifest, [new SummaryTool()])
}
