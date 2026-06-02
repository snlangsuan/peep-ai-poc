import skillMd from './skill.md' with { type: 'text' }

import { TodoManagementTool } from '#/core/chat/tools/todo-management.tool'
import { parseSkillManifestText, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

export function createTodoManagementSkill(): IChatSkill {
  const manifest = parseSkillManifestText(skillMd, 'todo_management/skill.md')
  return buildSkillFromManifest(manifest, [new TodoManagementTool()])
}
