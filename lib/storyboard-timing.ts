export type TimedStoryboardShot = Record<string, unknown> & {
  duration?: string | number
  durationReason?: string
  description?: string
  shotType?: string
  camera?: string
  dialogue?: string
  action?: string
  expression?: string
  blocking?: string
  cameraAngle?: string
  composition?: string
}

export const parseDurationSeconds = (duration: unknown) => {
  if (typeof duration === 'number') return duration
  if (typeof duration !== 'string') return 0
  const min = duration.match(/(\d+(?:\.\d+)?)\s*(?:min|分钟|分)/i)
  const sec = duration.match(/(\d+(?:\.\d+)?)\s*(?:s|秒)/i)
  if (min || sec) return (min ? Number(min[1]) * 60 : 0) + (sec ? Number(sec[1]) : 0)
  const n = Number(duration.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

const textLength = (...values: unknown[]) =>
  values.map((v) => String(v ?? '')).join('').replace(/\s/g, '').length

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const estimateShotWeight = (shot: TimedStoryboardShot, index: number, total: number) => {
  const text = [
    shot.description,
    shot.action,
    shot.expression,
    shot.blocking,
    shot.cameraAngle,
    shot.composition,
    shot.dialogue,
  ].join('\n')

  let weight = 3.2
  const chars = textLength(text)
  const dialogueChars = textLength(shot.dialogue)

  if (index === 0) weight += 1.2
  if (index === total - 1) weight += 1.3
  if (/特写|反应|眼神|泪|愣|震惊|冷笑|沉默|停顿|凝视/.test(text)) weight += 0.7
  if (/争执|质问|威胁|摊牌|反击|揭穿|逼问|怒/.test(text)) weight += 1.0
  if (/冲|跑|推|拉|抢|摔|递|接|转身|追|挡|打|跪|拥抱/.test(text)) weight += 0.9
  if (/进入|走向|离开|转场|全景|建立/.test(text)) weight += 0.4
  if (dialogueChars > 0) weight += clamp(dialogueChars / 18, 0.4, 2.2)
  if (chars > 90) weight += 0.8
  if (chars > 150) weight += 0.8

  if (shot.shotType === '特写') weight -= 0.2
  if (shot.shotType === '全景' || shot.shotType === '远景') weight += 0.5
  if (/推|拉|环绕|跟|移|摇|手持/.test(String(shot.camera ?? ''))) weight += 0.5
  if (/固定/.test(String(shot.camera ?? '')) && dialogueChars === 0) weight -= 0.3

  return clamp(weight, 2.2, 8.5)
}

const buildDurationReason = (shot: TimedStoryboardShot, seconds: number, index: number, total: number) => {
  const text = [
    shot.description,
    shot.action,
    shot.expression,
    shot.dialogue,
  ].join('\n')
  if (index === 0) return `开场钩子镜头，需要快速建立冲突和注意力，估为${seconds}秒`
  if (index === total - 1) return `结尾悬念/情绪落点，需要留出反应停顿，估为${seconds}秒`
  if (/争执|质问|威胁|摊牌|反击|揭穿|逼问/.test(text)) return `对白交锋或冲突推进信息量较高，估为${seconds}秒`
  if (/冲|跑|推|拉|抢|摔|递|接|转身|追|挡|打|跪|拥抱/.test(text)) return `动作推进需要完整起落和观众识别时间，估为${seconds}秒`
  if (/特写|反应|眼神|泪|愣|震惊|冷笑|沉默|凝视/.test(text)) return `反应/表情镜头以情绪捕捉为主，节奏偏短，估为${seconds}秒`
  if (textLength(shot.dialogue) > 0) return `含台词信息，需要保留说话和反应节奏，估为${seconds}秒`
  return `普通叙事推进镜头，按画面信息量和动作复杂度估为${seconds}秒`
}

const isFlatTiming = (seconds: number[]) => {
  const valid = seconds.filter((n) => n > 0)
  if (valid.length < 3) return false
  const unique = new Set(valid.map((n) => Math.round(n * 10) / 10))
  return unique.size <= 2
}

const distributeDelta = (
  values: number[],
  weights: number[],
  delta: number,
  min: number,
  max: number,
) => {
  if (delta === 0) return values
  const direction = delta > 0 ? 1 : -1
  let remaining = Math.abs(delta)
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => direction > 0 ? b.weight - a.weight : a.weight - b.weight)

  while (remaining > 0) {
    let changed = false
    for (const item of order) {
      const next = values[item.index] + direction
      if (next < min || next > max) continue
      values[item.index] = next
      remaining -= 1
      changed = true
      if (remaining === 0) break
    }
    if (!changed) break
  }
  return values
}

const rewriteDescriptionTimeRange = (description: unknown, start: number, end: number) => {
  const text = String(description ?? '')
  const range = `[${start}s-${end}s]`
  if (!text.trim()) return range
  if (/^\s*\[\d+(?:\.\d+)?s-\d+(?:\.\d+)?s\]/.test(text)) {
    return text.replace(/^\s*\[\d+(?:\.\d+)?s-\d+(?:\.\d+)?s\]/, range)
  }
  if (/^\s*\[\d+(?:\.\d+)?s\]/.test(text)) {
    return text.replace(/^\s*\[\d+(?:\.\d+)?s\]/, range)
  }
  return `${range} ${text}`
}

export const retimeStoryboardProfessionally = <T extends TimedStoryboardShot>(
  storyboard: T[],
  targetDuration: number,
) => {
  if (!Array.isArray(storyboard) || storyboard.length === 0) return storyboard

  const currentSeconds = storyboard.map((shot) => parseDurationSeconds(shot.duration))
  const currentTotal = currentSeconds.reduce((sum, seconds) => sum + seconds, 0)
  const target = Math.max(1, Math.round(targetDuration))
  const shouldRetime =
    isFlatTiming(currentSeconds) ||
    currentTotal < Math.max(1, target - 5) ||
    currentTotal > target + 5 ||
    currentSeconds.some((seconds) => seconds <= 0)

  if (!shouldRetime) return storyboard

  const weights = storyboard.map((shot, index) => estimateShotWeight(shot, index, storyboard.length))
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || storyboard.length
  const avg = target / storyboard.length
  const min = avg < 3 ? 1 : 2
  const max = clamp(Math.ceil(avg + 4), 5, 12)

  let durations = weights.map((weight) => clamp(Math.round((weight / weightTotal) * target), min, max))
  durations = distributeDelta(durations, weights, target - durations.reduce((sum, n) => sum + n, 0), min, max)

  let cursor = 0
  return storyboard.map((shot, index) => {
    const seconds = durations[index] ?? Math.round(avg)
    const start = cursor
    const end = cursor + seconds
    cursor = end
    return {
      ...shot,
      duration: `${seconds}s`,
      durationReason: buildDurationReason(shot, seconds, index, storyboard.length),
      description: rewriteDescriptionTimeRange(shot.description, start, end),
    }
  })
}
