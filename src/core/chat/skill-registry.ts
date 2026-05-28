import { readFileSync } from 'node:fs'

import { logger } from '#/common/libs/logger.lib'

import type { IChatSkill, IChatTool } from '~/src/core/chat/chat.type'

export interface ISkillManifest {
  name: string
  description: string
  creditCost: number
  allowDirectInvoke: boolean
  keywords: string[]
  instruction: string
}

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    return { meta: {}, body: raw.trim() }
  }
  const [, metaBlock = '', body = ''] = match
  const meta: Record<string, unknown> = {}
  for (const rawLine of metaBlock.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const colon = line.indexOf(':')
    if (colon === -1) continue
    const key = line.slice(0, colon).trim()
    const value = line.slice(colon + 1).trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      meta[key] = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else if (value === 'true' || value === 'false') {
      meta[key] = value === 'true'
    } else if (!Number.isNaN(Number(value)) && value !== '') {
      meta[key] = Number(value)
    } else {
      meta[key] = value.replace(/^['"]|['"]$/g, '')
    }
  }
  return { meta, body: body.trim() }
}

export function parseSkillManifest(skillMdPath: string): ISkillManifest {
  const raw = readFileSync(skillMdPath, 'utf-8')
  const { meta, body } = parseFrontmatter(raw)

  const name = typeof meta.name === 'string' ? meta.name : ''
  if (!name) {
    throw new Error(`skill.md at ${skillMdPath} is missing required "name" field in frontmatter`)
  }

  return {
    name,
    description: typeof meta.description === 'string' ? meta.description : '',
    creditCost: typeof meta.credit_cost === 'number' ? meta.credit_cost : 0,
    allowDirectInvoke: typeof meta.allow_direct_invoke === 'boolean' ? meta.allow_direct_invoke : true,
    keywords: Array.isArray(meta.keywords) ? (meta.keywords as string[]) : [],
    instruction: body,
  }
}

export function buildSkillFromManifest(manifest: ISkillManifest, tools: IChatTool[]): IChatSkill {
  return {
    name: manifest.name,
    description: manifest.description,
    instruction: manifest.instruction,
    tools,
    creditCost: manifest.creditCost,
    allowDirectInvoke: manifest.allowDirectInvoke,
    keywords: manifest.keywords,
  }
}

export class SkillRegistry {
  private skills = new Map<string, IChatSkill>()

  register(skill: IChatSkill): void {
    if (this.skills.has(skill.name)) {
      logger.warn({ skillName: skill.name }, '[skill-registry] overwriting existing skill registration')
    }
    this.skills.set(skill.name, skill)
  }

  get(name: string): IChatSkill | undefined {
    return this.skills.get(name)
  }

  getAll(): IChatSkill[] {
    return [...this.skills.values()]
  }

  has(name: string): boolean {
    return this.skills.has(name)
  }

  clear(): void {
    this.skills.clear()
  }
}
