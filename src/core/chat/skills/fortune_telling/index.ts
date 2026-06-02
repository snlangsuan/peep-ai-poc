import skillMd from './skill.md' with { type: 'text' }

import { FortuneTellingTool } from '#/core/chat/tools/fortune-telling.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createFortuneTellingSkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'fortune_telling/skill.md')
  return buildSkillFromManifest(manifest, [new FortuneTellingTool()])
}
