import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { ScheduleManagementTool } from '#/core/chat/tools/schedule-management.tool'
import { parseSkillManifest, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createScheduleManagementSkill(): IChatSkill {
  const manifest = parseSkillManifest(join(__dirname, 'skill.md'))
  return buildSkillFromManifest(manifest, [new ScheduleManagementTool()])
}
