/**
 * Deterministic (no-LLM) helpers for keeping long-running short-drama generation
 * consistent across many batches/episodes: a compact continuity summary to inject
 * into prompts, and a post-hoc consistency check over the finished episode list.
 */

export interface EpisodeDigest {
  ep: number
  title?: string
  hook?: string
  beats?: string[]
  satisfactionPoint?: string
  cliffhanger?: string
  script?: string
}

export interface ContinuitySeed {
  mustKeep?: string[]
  taboo?: string[]
  coreConflict?: string
}

/** Compact text block for prompt injection: hard constraints + a rolling window of recent episodes. */
export function buildContinuitySummary(
  seed: ContinuitySeed,
  episodes: EpisodeDigest[],
  windowSize = 5,
): string {
  const parts: string[] = []
  if (seed.coreConflict) parts.push(`核心矛盾：${seed.coreConflict}`)
  if (seed.mustKeep?.length) parts.push(`必须遵守的硬设定：${seed.mustKeep.join('；')}`)
  if (seed.taboo?.length) parts.push(`必须避免：${seed.taboo.join('；')}`)

  const recent = episodes.slice(-windowSize)
  if (recent.length > 0) {
    const digest = recent
      .map((e) => `第${e.ep}集${e.title ? `《${e.title}》` : ''}：爽点=${e.satisfactionPoint ?? ''}；悬念=${e.cliffhanger ?? ''}`)
      .join('\n')
    parts.push(`最近${recent.length}集回顾：\n${digest}`)
  }

  return parts.join('\n\n')
}

export interface ConsistencyWarning {
  type: 'unused_character' | 'missing_mustkeep' | 'character_drops_off'
  message: string
}

const episodeText = (e: EpisodeDigest) =>
  [e.title, e.hook, ...(e.beats ?? []), e.satisfactionPoint, e.cliffhanger, e.script].filter(Boolean).join(' ')

/**
 * Pure substring-based checks — no LLM call, so these are hints for a human to glance
 * at, not proof of a bug. Under-warn on purpose: a missed hit just means no warning,
 * which is the safer failure direction for a heuristic tool.
 */
export function checkDramaConsistency(params: {
  characters: Array<{ name: string }>
  mustKeep?: string[]
  episodes: EpisodeDigest[]
}): ConsistencyWarning[] {
  const { characters, mustKeep, episodes } = params
  if (episodes.length === 0) return []
  const warnings: ConsistencyWarning[] = []

  const fullText = episodes.map(episodeText).join(' ')

  for (const char of characters) {
    if (!char.name) continue
    if (!fullText.includes(char.name)) {
      warnings.push({ type: 'unused_character', message: `角色「${char.name}」在所有分集大纲中都未被提及，确认是否需要该角色` })
    }
  }

  for (const item of mustKeep ?? []) {
    if (!item) continue
    if (!fullText.includes(item)) {
      warnings.push({ type: 'missing_mustkeep', message: `硬设定「${item}」在分集大纲中未出现，可能没有被落实` })
    }
  }

  if (episodes.length >= 6) {
    const mid = Math.floor(episodes.length / 2)
    const firstHalfText = episodes.slice(0, mid).map(episodeText).join(' ')
    const secondHalfText = episodes.slice(mid).map(episodeText).join(' ')
    for (const char of characters) {
      if (!char.name) continue
      if (firstHalfText.includes(char.name) && !secondHalfText.includes(char.name)) {
        warnings.push({ type: 'character_drops_off', message: `角色「${char.name}」只出现在前半季，后半季没有戏份` })
      }
    }
  }

  return warnings
}
