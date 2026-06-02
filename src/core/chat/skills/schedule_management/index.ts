import skillMd from './skill.md' with { type: 'text' }

import { ScheduleManagementTool } from '#/core/chat/tools/schedule-management.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createScheduleManagementSkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'schedule_management/skill.md')
  return buildSkillFromManifest(manifest, [new ScheduleManagementTool()])
}
