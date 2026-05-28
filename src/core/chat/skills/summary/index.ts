import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { SummaryTool } from '#/core/chat/tools/summary.tool'
import { parseSkillManifest, buildSkillFromManifest } from '#/core/chat/skill-registry'

import type { IChatSkill } from '~/src/core/chat/chat.type'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createSummarySkill(): IChatSkill {
  const manifest = parseSkillManifest(join(__dirname, 'skill.md'))
  return buildSkillFromManifest(manifest, [new SummaryTool()])
}
