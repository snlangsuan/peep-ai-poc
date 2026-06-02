import skillMd from './skill.md' with { type: 'text' }

import { ExpenseManagementTool } from '#/core/chat/tools/expense-management.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createExpenseManagementSkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'expense_management/skill.md')
  return buildSkillFromManifest(manifest, [new ExpenseManagementTool()])
}
