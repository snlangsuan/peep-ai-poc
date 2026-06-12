import skillMd from './skill.md' with { type: 'text' }

import { AccountManagementTool } from '#/core/chat/tools/account-management.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createAccountManagementSkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'account_management/skill.md')
  return buildSkillFromManifest(manifest, [new AccountManagementTool()])
}
