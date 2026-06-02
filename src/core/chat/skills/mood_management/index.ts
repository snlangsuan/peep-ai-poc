import skillMd from './skill.md' with { type: 'text' }

import { MoodManagementTool } from '#/core/chat/tools/mood-management.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createMoodManagementSkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'mood_management/skill.md')
  return buildSkillFromManifest(manifest, [new MoodManagementTool()])
}
