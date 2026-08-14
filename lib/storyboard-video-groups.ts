export type StoryboardVideoGroup = {
  rows: Array<Record<string, unknown>>
  start: number
  seconds: number
}

export const storyboardGroupHandle = (maxDuration: 15 | 30, groupIndex: number) =>
  `group-${maxDuration}-${groupIndex}`

export const parseStoryboardGroupHandle = (handle?: string | null) => {
  const match = handle?.match(/^group-(15|30)-(\d+)$/)
  if (!match) return null
  return {
    maxDuration: Number(match[1]) as 15 | 30,
    groupIndex: Number(match[2]),
  }
}

export const parseStoryboardDurationSeconds = (duration: unknown) => {
  if (typeof duration === 'number') return duration
  if (typeof duration !== 'string') return 0
  const min = duration.match(/(\d+(?:\.\d+)?)\s*(?:min|分钟|分)/i)
  const sec = duration.match(/(\d+(?:\.\d+)?)\s*(?:s|秒)/i)
  if (min || sec) return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0)
  const n = Number(duration.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export const buildStoryboardVideoGroups = (
  rows: Array<Record<string, unknown>>,
  maxDuration: 15 | 30,
): StoryboardVideoGroup[] => {
  const validRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => typeof row.description === 'string' && row.description.trim())

  const groups: StoryboardVideoGroup[] = []
  let current: Array<Record<string, unknown>> = []
  let currentStart = 0
  let currentSeconds = 0

  validRows.forEach(({ row, index }) => {
    const seconds = Math.max(1, parseStoryboardDurationSeconds(row.duration) || 4)
    if (current.length > 0 && currentSeconds + seconds > maxDuration) {
      groups.push({ rows: current, start: currentStart, seconds: currentSeconds })
      current = []
      currentSeconds = 0
      currentStart = index
    }
    if (current.length === 0) currentStart = index
    current.push(row)
    currentSeconds += seconds
  })

  if (current.length > 0) groups.push({ rows: current, start: currentStart, seconds: currentSeconds })
  return groups
}

export const storyboardRowToPromptText = (row: Record<string, unknown>, index: number) => [
  `镜头${index + 1}：`,
  row.locationName ? `场景：${row.locationName}` : '',
  Array.isArray(row.characters) && row.characters.length ? `角色：${row.characters.join('、')}` : '',
  Array.isArray(row.propNames) && row.propNames.length ? `道具：${row.propNames.join('、')}` : '',
  row.description ? `画面：${row.description}` : '',
  row.blocking ? `站位：${row.blocking}` : '',
  row.action ? `动作：${row.action}` : '',
  row.expression ? `表情：${row.expression}` : '',
  row.cameraAngle ? `机位：${row.cameraAngle}` : '',
  row.composition ? `构图：${row.composition}` : '',
  row.shotType ? `景别：${row.shotType}` : '',
  row.camera ? `运镜：${row.camera}` : '',
  row.dialogue ? `台词/旁白：${row.dialogue}` : '',
].filter(Boolean).join('\n')

export const storyboardRowsToVideoPrompt = (
  rows: Array<Record<string, unknown>>,
  startIndex: number,
  totalSeconds: number,
  maxSeconds: number,
) => {
  const shotLines = rows.map((row, i) => {
    const shotNo = startIndex + i + 1
    return [
      `镜头${shotNo}（${row.duration ?? '约3-5s'}）：`,
      row.locationName ? `场景：${row.locationName}` : '',
      Array.isArray(row.characters) && row.characters.length ? `角色：${row.characters.join('、')}` : '',
      Array.isArray(row.propNames) && row.propNames.length ? `道具：${row.propNames.join('、')}` : '',
      row.description ? `画面：${row.description}` : '',
      row.blocking ? `站位：${row.blocking}` : '',
      row.action ? `动作：${row.action}` : '',
      row.expression ? `表情：${row.expression}` : '',
      row.cameraAngle ? `机位：${row.cameraAngle}` : '',
      row.composition ? `构图：${row.composition}` : '',
      row.shotType ? `景别：${row.shotType}` : '',
      row.camera ? `运镜：${row.camera}` : '',
      row.dialogue ? `台词/旁白：${row.dialogue}` : '',
    ].filter(Boolean).join('\n')
  }).join('\n\n')

  return `请生成一段连续短剧视频，包含以下${rows.length}个连续镜头。
总时长约${Math.round(totalSeconds)}秒，不超过${maxSeconds}秒。保持角色外貌、服装、场景空间和光线连续一致；镜头之间自然衔接，不要跳戏。

${shotLines}

生成要求：
- 竖屏短剧节奏，动作清楚，表情明确
- 严格按镜头顺序推进，不要省略镜头
- 台词/旁白如出现，请与镜头情绪匹配
- 画面不要出现水印、字幕乱码、额外文字`
}
