'use client'

import { memo, useState, useMemo, useRef, useEffect } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { BookOpen, ChevronDown, ChevronRight, Sparkles, Check, Loader2, AlertCircle, RotateCcw, Pencil, Save, X, Download, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { useModels } from '@/hooks/use-models'
import {
  DRAMA_BATCH_SIZE, buildDramaAssetExtractionPrompt, buildDramaQualityReviewPrompt, buildDramaRewriteByQualityPrompt,
  buildGenericQualityReviewPrompt, buildGenericRewriteByQualityPrompt, CONTENT_TYPE_LABELS, ContentType,
} from './script-node-prompts'
import { CopyButton } from '@/components/copy-button'

interface ScreenplayContent {
  title: string
  synopsis: string
  content: string
  scriptDuration?: string
  contentType?: string
  dramaTemplate?: string
  firstHook?: string
  episodeDuration?: number
  characters?: Array<{ name: string; role?: string; appearance?: string; personality?: string }>
  episodes?: ScreenplayEpisode[]
  storyBible?: {
    logline?: string
    audience?: string
    emotionalPromise?: string
    coreConflict?: string
    protagonistArc?: string
    antagonistPressure?: string
    relationshipEngine?: string
    visualStyle?: string
  }
  qualityReport?: {
    totalScore?: number
    verdict?: string
    strengths?: string[]
    risks?: string[]
    rewriteSuggestions?: string[]
  }
}

type ScreenplayEpisode = { ep: number; title?: string; hook?: string; beats?: string[]; satisfactionPoint?: string; cliffhanger?: string }

const cleanFileName = (name: string) =>
  (name || '剧本').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-').slice(0, 80)

const listMarkdown = (items?: string[]) => {
  if (!items?.length) return ''
  return items.map((item) => `- ${item}`).join('\n')
}

/** 将长剧本按段落切成可独立分析的批次，避免一次请求同时压爆上下文和输出预算。 */
const splitLongScript = (text: string, maxChars = 14000) => {
  const paragraphs = text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) { chunks.push(current); current = '' }
      for (let i = 0; i < paragraph.length; i += maxChars) chunks.push(paragraph.slice(i, i + maxChars))
      continue
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      chunks.push(current)
      current = ''
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  if (current) chunks.push(current)
  return chunks.length ? chunks : [text]
}

const screenplayToMarkdown = (screenplay: ScreenplayContent) => {
  const lines: string[] = []
  lines.push(`# ${screenplay.title || '未命名剧本'}`)
  lines.push('')
  lines.push(`> 导出时间：${new Date().toLocaleString()}`)
  if (screenplay.scriptDuration) lines.push(`> 时长：${screenplay.scriptDuration}`)
  if (screenplay.episodeDuration) lines.push(`> 单集时长：${screenplay.episodeDuration} 秒`)
  lines.push('')

  if (screenplay.synopsis) {
    lines.push('## 故事概要')
    lines.push('')
    lines.push(screenplay.synopsis)
    lines.push('')
  }

  if (screenplay.storyBible) {
    lines.push('## 故事圣经')
    lines.push('')
    const bibleLabels: Record<string, string> = {
      logline: '一句话卖点',
      audience: '目标受众',
      emotionalPromise: '情绪承诺',
      coreConflict: '核心矛盾',
      protagonistArc: '主角弧线',
      antagonistPressure: '反派压力',
      relationshipEngine: '关系引擎',
      visualStyle: '视觉方向',
    }
    Object.entries(screenplay.storyBible).forEach(([key, value]) => {
      if (!value) return
      lines.push(`### ${bibleLabels[key] ?? key}`)
      lines.push('')
      lines.push(String(value))
      lines.push('')
    })
  }

  if (screenplay.characters?.length) {
    lines.push('## 角色设定')
    lines.push('')
    screenplay.characters.forEach((char) => {
      lines.push(`### ${char.name}`)
      lines.push('')
      if (char.role) lines.push(`- 定位：${char.role}`)
      if (char.personality) lines.push(`- 性格：${char.personality}`)
      if (char.appearance) lines.push(`- 外貌：${char.appearance}`)
      lines.push('')
    })
  }

  if (screenplay.episodes?.length) {
    lines.push('## 分集大纲')
    lines.push('')
    screenplay.episodes.forEach((ep) => {
      lines.push(`### 第 ${ep.ep} 集 ${ep.title ?? ''}`.trim())
      lines.push('')
      if (ep.hook) lines.push(`**开场钩子：** ${ep.hook}`)
      if (ep.beats?.length) {
        lines.push('')
        lines.push('**剧情节点：**')
        lines.push(listMarkdown(ep.beats))
      }
      if (ep.satisfactionPoint) {
        lines.push('')
        lines.push(`**本集爽点：** ${ep.satisfactionPoint}`)
      }
      if (ep.cliffhanger) {
        lines.push('')
        lines.push(`**结尾悬念：** ${ep.cliffhanger}`)
      }
      lines.push('')
    })
  }

  if (screenplay.qualityReport) {
    lines.push('## 编剧质检')
    lines.push('')
    if (screenplay.qualityReport.totalScore !== undefined) lines.push(`**总分：** ${screenplay.qualityReport.totalScore}/100`)
    if (screenplay.qualityReport.verdict) lines.push(`**结论：** ${screenplay.qualityReport.verdict}`)
    if (screenplay.qualityReport.strengths?.length) {
      lines.push('')
      lines.push('**优势：**')
      lines.push(listMarkdown(screenplay.qualityReport.strengths))
    }
    if (screenplay.qualityReport.risks?.length) {
      lines.push('')
      lines.push('**风险：**')
      lines.push(listMarkdown(screenplay.qualityReport.risks))
    }
    if (screenplay.qualityReport.rewriteSuggestions?.length) {
      lines.push('')
      lines.push('**改稿建议：**')
      lines.push(listMarkdown(screenplay.qualityReport.rewriteSuggestions))
    }
    lines.push('')
  }

  if (screenplay.content) {
    lines.push('## 完整剧本')
    lines.push('')
    lines.push(screenplay.content)
    lines.push('')
  }

  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

const markdownToWordHtml = (markdown: string, title: string) => {
  const escapeHtml = (text: string) =>
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = escapeHtml(markdown)
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^\*\*(.+?)：\*\* (.+)$/gm, '<p><strong>$1：</strong>$2</p>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^&gt; (.+)$/gm, '<p class="meta">$1</p>')
    .replace(/\n/g, '<br />')
    .replace(/(<li>.*?<\/li>)(?:<br \/>)+/g, '<ul>$1</ul>')
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; line-height: 1.72; color: #111; padding: 40px; }
    h1 { font-size: 28px; margin: 0 0 16px; }
    h2 { font-size: 20px; margin: 28px 0 12px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
    h3 { font-size: 16px; margin: 20px 0 8px; }
    p, li { font-size: 12pt; }
    .meta { color: #666; }
  </style>
</head>
<body>${html}</body>
</html>`
}

type ScreenplayNodeProps = NodeProps<Node<CustomNodeData>>

function ScreenplayNode({ id, data, selected }: ScreenplayNodeProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const createAssetsFromExtraction = useFlowStore((s) => s.createAssetsFromExtraction)
  const createEpisodeAssetsAndList = useFlowStore((s) => s.createEpisodeAssetsAndList)

  const { models: textModels } = useModels({ type: 'text' })
  const [selectedModel, setSelectedModel] = useState('')
  useEffect(() => {
    if (textModels.length > 0 && !selectedModel) setSelectedModel(textModels[0].id)
  }, [textModels, selectedModel])

  const screenplay = useMemo<ScreenplayContent | null>(() => {
    try { return JSON.parse(data.content as string) } catch { return null }
  }, [data.content])

  const isDrama = !!screenplay && screenplay.contentType === 'shortdrama' && (screenplay.episodes?.length ?? 0) > 0

  const [contentExpanded, setContentExpanded] = useState(true)
  const [assetExtracted, setAssetExtracted] = useState(data.status === 'completed')
  const [isExtracting, setIsExtracting] = useState(false)
  const [isRewriting, setIsRewriting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [rewriteError, setRewriteError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // See script-node.tsx: switching projects unmounts nodes mid-generation without
  // aborting their in-flight fetch. Abort on unmount so the request doesn't keep
  // running for a node that no longer exists in the store.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSynopsis, setEditSynopsis] = useState('')
  const [editContent, setEditContent] = useState('')

  const startEdit = () => {
    if (!screenplay) return
    setEditTitle(screenplay.title)
    setEditSynopsis(screenplay.synopsis)
    setEditContent(screenplay.content)
    setIsEditing(true)
  }

  const cancelEdit = () => setIsEditing(false)

  const saveEdit = () => {
    if (!screenplay) return
    const updated = { ...screenplay, title: editTitle.trim() || screenplay.title, synopsis: editSynopsis, content: editContent }
    updateNodeData(id, {
      label: `剧本：${updated.title}`,
      content: JSON.stringify(updated),
      status: 'ready',
    })
    setIsEditing(false)
    setAssetExtracted(false)
  }

  if (!screenplay) return null

  const downloadFile = (fileName: string, content: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const exportMarkdown = () => {
    const markdown = screenplayToMarkdown(screenplay)
    downloadFile(`${cleanFileName(screenplay.title)}.md`, markdown, 'text/markdown;charset=utf-8')
  }

  const exportWord = () => {
    const markdown = screenplayToMarkdown(screenplay)
    const html = markdownToWordHtml(markdown, screenplay.title)
    downloadFile(`${cleanFileName(screenplay.title)}.doc`, html, 'application/msword;charset=utf-8')
  }

  const storyBibleText = screenplay.storyBible
    ? Object.entries(screenplay.storyBible)
        .filter(([, value]) => !!value)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
    : ''

  const qualityReportText = screenplay.qualityReport
    ? [
        screenplay.qualityReport.totalScore !== undefined ? `总分：${screenplay.qualityReport.totalScore}/100` : '',
        screenplay.qualityReport.verdict ? `结论：${screenplay.qualityReport.verdict}` : '',
        screenplay.qualityReport.strengths?.length ? `优势：\n${listMarkdown(screenplay.qualityReport.strengths)}` : '',
        screenplay.qualityReport.risks?.length ? `风险：\n${listMarkdown(screenplay.qualityReport.risks)}` : '',
        screenplay.qualityReport.rewriteSuggestions?.length ? `改稿建议：\n${listMarkdown(screenplay.qualityReport.rewriteSuggestions)}` : '',
      ].filter(Boolean).join('\n\n')
    : ''

  const extractJsonObject = (raw: string) => {
    const text = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
    const start = text.indexOf('{')
    if (start < 0) return ''
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      if (ch === '{') depth++
      if (ch === '}') {
        depth--
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
    return text.slice(start)
  }

  const parseJson = (raw: string) => {
    const json = extractJsonObject(raw)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/:\s*undefined/g, ': null')
    if (!json) throw new Error('无法解析 JSON')
    return JSON.parse(json)
  }

  const callTextJson = async (systemPrompt: string, prompt: string, controller: AbortController, maxTokens = 9000) => {
    const res = await fetch('/api/generate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, prompt, systemPrompt, temperature: 0.75, maxTokens }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const eb = await res.json().catch(() => ({} as Record<string, string>))
      throw new Error(eb.error || `HTTP ${res.status}`)
    }
    const { text } = await res.json() as { text: string }
    if (!text?.trim()) throw new Error('生成结果为空')
    try {
      return parseJson(text)
    } catch (firstErr) {
      const repairRes = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt: `下面内容不是合法JSON。请修复语法错误，保留原有字段含义，只返回合法JSON：\n\n${text.slice(0, 18000)}`,
          systemPrompt: '你是JSON修复器。只返回严格合法JSON，不要解释。尤其修复字符串值内部未转义的英文双引号。',
          temperature: 0.05,
          maxTokens,
        }),
        signal: controller.signal,
      })
      if (!repairRes.ok) throw firstErr
      const repaired = await repairRes.json() as { text: string }
      try { return parseJson(repaired.text) } catch { throw firstErr }
    }
  }

  const handleExtractAssets = async () => {
    if (!screenplay || isExtracting || !selectedModel) return
    setIsExtracting(true)
    setExtractError(null)
    updateNodeData(id, { status: 'generating' })

    const controller = new AbortController()
    abortRef.current = controller

    const durationHint = screenplay.scriptDuration
      ? `整剧时长：${screenplay.scriptDuration}，请根据此时长合理分配每个分镜的时间。`
      : '请根据剧情合理分配分镜时间。'

    const systemPrompt = `你是专业的剧本分析师和Seedance 2.0分镜规划师。从完整剧本文本中提取所有资产并规划完整的分镜表。

时长要求：${durationHint}

资产关联要求：
- locationName必须与locations中的name完全一致
- 只要角色出现在description、blocking、action、expression或dialogue任一字段中，就必须加入characterNames
- 只要道具出现在description、blocking、action、expression或dialogue任一字段中，就必须加入propNames
- description里的@角色名必须能在characterNames里找到对应项

严格按 JSON 返回，不要有任何其他内容。
字符串值内部不要使用英文双引号 "，对白、称谓、强调内容请使用中文引号「」：
{
  "characters": [
    {"name":"角色名","appearance":"详细外貌描述（中文）：性别、年龄、体型、发型发色、五官特征、服装颜色材质、配饰、标志性特征","role":"主角/配角/路人"}
  ],
  "locations": [
    {"name":"场景名（简洁中文，如：村口雪地、农夫家中、山间小路）","description":"场景环境描述（中文）：具体地点、建筑风格或自然地貌、光线时段、氛围特征，不含人物","atmosphere":"氛围（中文），如：清晨寒风、霓虹夜景、温暖室内等"}
  ],
  "props": [
    {"name":"道具名（中文）","description":"道具描述（中文）：材质、颜色、形状、尺寸、风格特征，白色背景展示"}
  ],
  "storyboard": [
    {
      "shot": 1,
      "duration": "5s",
      "locationName": "对应locations中的场景名（必须完全一致）",
      "characterNames": ["【必填】此镜头中出现、说话、行动或被特写的所有角色名，与characters中的name字段完全一致。即使是背景角色也要列出。确实无角色出现则为[]"],
      "propNames": ["【必填】此镜头中出现、使用或特写的道具名，与props中的name字段完全一致。即使是背景中的道具也要列出。确实无道具则为[]"],
      "description": "严格按此格式输出：[0s-{duration}] @{locationName精简名} 场景细节。@{角色1名} 动作细节。@{角色2名} 动作细节（如有）。camera动作(英文：push in/pull out/follows/pans/static/low angle等)。光线情绪。注意：description中每个@名称必须与characterNames和locationName中的名称完全一致，且characterNames数组必须包含description中所有@到的角色",
      "blocking": "【必填】角色站位与空间关系，如：女主画面左前景，男主右后方半步，反派隔桌压迫",
      "action": "【必填】角色动作，如：女主攥紧合同抬头反击，男主伸手挡住反派",
      "expression": "【必填】表情/情绪，如：女主强忍委屈后转为冷静，反派轻蔑冷笑",
      "cameraAngle": "【必填】机位/角度，如：低机位仰拍、过肩视角、俯拍压迫、侧逆光",
      "composition": "【必填】构图，如：三分法、前景遮挡、中心压迫、左右对峙、留白方向",
      "shotType": "【必填】景别，从以下选项中选择一个：特写/近景/中景/中全景/全景/远景/大远景。根据镜头内容和叙事需要选择最合适的景别，每个分镜必须明确填写",
      "camera": "推进/拉远/跟随/固定/环绕/手持",
      "dialogue": "该镜头的台词（若无则为空字符串）",
      "negativePrompt": "画面模糊, 水印, 文字, 低画质",
      "aspectRatio": "16:9"
    }
  ]
}`

    try {
      // ── Short drama: extract whole-drama locations/props, then build episode list ──
      if (screenplay.contentType === 'shortdrama' && (screenplay.episodes?.length ?? 0) > 0) {
        const chars = (screenplay.characters ?? []).map((c) => ({
          name: c.name, appearance: c.appearance ?? '', role: c.role ?? '配角',
        }))
        const dp = buildDramaAssetExtractionPrompt({
          title: screenplay.title,
          synopsis: screenplay.synopsis,
          content: screenplay.content,
          characters: screenplay.characters ?? [],
          episodes: screenplay.episodes ?? [],
        })
        const dres = await fetch('/api/generate/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: selectedModel, prompt: dp.user, systemPrompt: dp.system, temperature: 0.7, maxTokens: 12000 }),
          signal: controller.signal,
        })
        if (!dres.ok) {
          const eb = await dres.json().catch(() => ({} as Record<string, string>))
          throw new Error(eb.error || `HTTP ${dres.status}`)
        }
        const dr = await dres.json() as { text: string }
        const dtext = dr.text?.trim()
        if (!dtext) throw new Error('提取结果为空')
        const dm = dtext.match(/\{[\s\S]*\}/)
        if (!dm) throw new Error('无法解析 JSON')
        const djson = dm[0].replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}').replace(/:\s*undefined/g, ': null')
        const dparsed = JSON.parse(djson)
        createEpisodeAssetsAndList(id, {
          characters: chars,
          locations: Array.isArray(dparsed.locations) ? dparsed.locations : [],
          props: Array.isArray(dparsed.props) ? dparsed.props : [],
          episodes: screenplay.episodes ?? [],
          episodeDuration: screenplay.episodeDuration,
        })
        setAssetExtracted(true)
        updateNodeData(id, { status: 'completed' })
        return
      }

      const chunks = splitLongScript(screenplay.content)
      const merged = { characters: [] as any[], locations: [] as any[], props: [] as any[], storyboard: [] as any[] }
      for (let index = 0; index < chunks.length; index++) {
        const part = chunks[index]
        const partResult = await callTextJson(
          systemPrompt,
          `【剧本标题】${screenplay.title}\n\n【故事概要】${screenplay.synopsis}\n\n【长剧本分段分析】这是第 ${index + 1}/${chunks.length} 段。只分析本段中实际出现的角色、场景、道具和分镜，不要臆造未出现的内容。\n\n【本段剧本】\n${part}`,
          controller,
          12000,
        )
        const addUnique = (target: any[], items: unknown, key: string) => {
          if (!Array.isArray(items)) return
          for (const item of items) {
            const name = String((item as Record<string, unknown>)?.[key] ?? '').trim()
            const existing = name && target.find((value) => String(value?.[key] ?? '').trim() === name)
            if (existing && typeof item === 'object') Object.assign(existing, item)
            else if (typeof item === 'object') target.push(item)
          }
        }
        addUnique(merged.characters, partResult.characters, 'name')
        addUnique(merged.locations, partResult.locations, 'name')
        addUnique(merged.props, partResult.props, 'name')
        if (Array.isArray(partResult.storyboard)) merged.storyboard.push(...partResult.storyboard.map((shot: Record<string, unknown>) => ({ ...shot, shot: merged.storyboard.length + 1 })))
      }

      if (!merged.characters.length && !merged.storyboard.length) throw new Error('长剧本分段分析没有返回有效内容')
      createAssetsFromExtraction(id, merged)
      setAssetExtracted(true)
      updateNodeData(id, { status: 'completed' })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateNodeData(id, { status: 'ready' })
        return
      }
      console.error('资产提取失败:', err)
      setExtractError(err instanceof Error ? err.message : '未知错误')
      updateNodeData(id, { status: 'failed' })
    } finally {
      setIsExtracting(false)
      abortRef.current = null
    }
  }

  const handleRewriteByQuality = async () => {
    if (!screenplay || !screenplay.qualityReport || isRewriting || !selectedModel) return
    setIsRewriting(true)
    setRewriteError(null)
    updateNodeData(id, { status: 'generating' })

    const controller = new AbortController()
    abortRef.current = controller

    try {
      if (!isDrama) {
        // Single-shot content types: one rewrite call, one re-review call — no episode
        // batching needed since there's only one piece, not a whole season.
        const contentType = (screenplay.contentType as ContentType) || 'shortvideo'
        const typeLabel = CONTENT_TYPE_LABELS[contentType] ?? screenplay.contentType ?? ''
        const rewritePrompt = buildGenericRewriteByQualityPrompt({
          contentType, typeLabel,
          title: screenplay.title,
          synopsis: screenplay.synopsis,
          content: screenplay.content,
          qualityReport: screenplay.qualityReport,
        })
        const rewritten = await callTextJson(rewritePrompt.system, rewritePrompt.user, controller, 16000)
        if (!rewritten.title) throw new Error('改稿结果缺少标题字段')
        const nextContent = typeof rewritten.content === 'string' ? rewritten.content : screenplay.content

        const reviewPrompt = buildGenericQualityReviewPrompt({
          contentType, typeLabel,
          title: rewritten.title, synopsis: rewritten.synopsis || '', content: nextContent,
        })
        const nextQuality = await callTextJson(reviewPrompt.system, reviewPrompt.user, controller, 16000)

        const prevScore = screenplay.qualityReport?.totalScore
        const nextScore = nextQuality?.totalScore
        if (typeof prevScore === 'number' && typeof nextScore === 'number' && nextScore <= prevScore) {
          setRewriteError(`评分从 ${prevScore} 分变为 ${nextScore} 分，没有改善，已放弃本次改稿结果并保留原内容，可重试`)
          updateNodeData(id, { status: 'ready' })
          return
        }

        const updated: ScreenplayContent = {
          ...screenplay,
          title: rewritten.title,
          synopsis: rewritten.synopsis ?? screenplay.synopsis,
          content: nextContent,
          qualityReport: nextQuality,
        }
        updateNodeData(id, { content: JSON.stringify(updated), status: 'ready' })
        setAssetExtracted(false)
        return
      }

      // Rewriting every episode in one call scales badly — a 20+ episode season can
      // overrun any maxTokens budget before the model finishes (worse on reasoning
      // models, which can burn the whole budget on thinking alone). Batch it the same
      // way the initial outline generation already does.
      const sourceEpisodes = screenplay.episodes ?? []
      let episodes: ScreenplayEpisode[] = []
      for (let from = 1; from <= sourceEpisodes.length; from += DRAMA_BATCH_SIZE) {
        const to = Math.min(from + DRAMA_BATCH_SIZE - 1, sourceEpisodes.length)
        const rewritePrompt = buildDramaRewriteByQualityPrompt({
          title: screenplay.title,
          synopsis: screenplay.synopsis,
          content: screenplay.content,
          storyBible: screenplay.storyBible,
          characters: screenplay.characters ?? [],
          episodes: sourceEpisodes,
          episodeDuration: screenplay.episodeDuration ?? 90,
          template: screenplay.dramaTemplate,
          qualityReport: screenplay.qualityReport,
          rewriteFrom: from,
          rewriteTo: to,
        })
        const rewritten = await callTextJson(rewritePrompt.system, rewritePrompt.user, controller, 16000)
        const batchEpisodes = Array.isArray(rewritten.episodes) ? rewritten.episodes : []
        const expectedBatchCount = to - from + 1
        if (batchEpisodes.length !== expectedBatchCount) {
          throw new Error(`第${from}-${to}集改稿数量不一致：需要${expectedBatchCount}集，实际${batchEpisodes.length}集`)
        }
        episodes = [...episodes, ...batchEpisodes]
      }
      episodes = episodes.map((ep: ScreenplayEpisode, i: number) => ({ ...ep, ep: ep.ep ?? i + 1 }))

      const reviewPrompt = buildDramaQualityReviewPrompt({
        title: screenplay.title,
        synopsis: screenplay.synopsis,
        storyBible: screenplay.storyBible,
        characters: screenplay.characters ?? [],
        episodes,
        episodeDuration: screenplay.episodeDuration ?? 90,
      })
      const nextQuality = await callTextJson(reviewPrompt.system, reviewPrompt.user, controller, 16000)

      // LLM rewrites aren't monotonic — a "fix" pass can lower the score just as easily
      // as raise it (batched rewrites in particular can drift on cross-episode
      // consistency). Don't silently apply a regression: the screenplay itself is still
      // fine, so this isn't a "failed" state, just a discarded attempt.
      const prevScore = screenplay.qualityReport?.totalScore
      const nextScore = nextQuality?.totalScore
      if (typeof prevScore === 'number' && typeof nextScore === 'number' && nextScore <= prevScore) {
        setRewriteError(`评分从 ${prevScore} 分变为 ${nextScore} 分，没有改善，已放弃本次改稿结果并保留原内容，可重试`)
        updateNodeData(id, { status: 'ready' })
        return
      }

      const updated: ScreenplayContent = {
        ...screenplay,
        episodes,
        qualityReport: nextQuality,
      }
      updateNodeData(id, {
        content: JSON.stringify(updated),
        status: 'ready',
      })
      setAssetExtracted(false)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        updateNodeData(id, { status: 'ready' })
        return
      }
      setRewriteError(err instanceof Error ? err.message : '改稿失败')
      updateNodeData(id, { status: 'failed' })
    } finally {
      setIsRewriting(false)
      abortRef.current = null
    }
  }

  return (
    <NodeBase
      nodeId={id}
      nodeType="screenplay"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<BookOpen className="size-3.5" />}
      width="w-[920px]"
    >
      {/* ── Two columns: metadata (title/bible/quality) | full screenplay content ── */}
      <div className="flex items-start gap-3">
        {/* ── Left: title/synopsis, story bible, quality report, errors ── */}
        <div className="w-[320px] shrink-0 space-y-2.5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5">
            {isEditing ? (
              <div className="flex flex-col gap-2">
                <input
                  onPointerDown={(e) => e.stopPropagation()}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="剧本标题"
                  className="w-full rounded-lg border border-primary/30 bg-background/60 px-2.5 py-1.5 text-[13px] font-semibold text-foreground outline-none focus:border-primary/60"
                />
                <textarea
                  onPointerDown={(e) => e.stopPropagation()}
                  value={editSynopsis}
                  onChange={(e) => setEditSynopsis(e.target.value)}
                  placeholder="故事概要…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-border/40 bg-background/60 px-2.5 py-1.5 text-[12px] leading-relaxed text-muted-foreground outline-none focus:border-primary/40"
                />
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-start gap-1.5">
                    <h3 className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">{screenplay.title}</h3>
                    <CopyButton
                      text={`${screenplay.title}\n\n${screenplay.synopsis}`}
                      iconOnly
                      title="复制标题和概要"
                      className="-mt-0.5"
                    />
                  </div>
                  {screenplay.synopsis && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{screenplay.synopsis}</p>
                  )}
                  {screenplay.scriptDuration && (
                    <div className="mt-2 text-[11px] text-amber-600">⏱ 时长：{screenplay.scriptDuration}</div>
                  )}
                  {screenplay.qualityReport?.totalScore !== undefined && (
                    <div className="mt-2 inline-flex rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500">
                      编剧质检 {screenplay.qualityReport.totalScore}/100
                    </div>
                  )}
                </div>
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={startEdit}
                  title="编辑剧本"
                  className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground/40 transition-colors hover:bg-muted/40 hover:text-foreground/70"
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          {isDrama && screenplay.storyBible && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-amber-500">故事圣经</div>
                <CopyButton text={storyBibleText} iconOnly title="复制故事圣经" className="text-amber-500/70 hover:bg-amber-500/10" />
              </div>
              <div className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {screenplay.storyBible.logline && <p><span className="text-foreground/70">卖点：</span>{screenplay.storyBible.logline}</p>}
                {screenplay.storyBible.coreConflict && <p><span className="text-foreground/70">核心矛盾：</span>{screenplay.storyBible.coreConflict}</p>}
                {screenplay.storyBible.emotionalPromise && <p><span className="text-foreground/70">情绪承诺：</span>{screenplay.storyBible.emotionalPromise}</p>}
                {screenplay.storyBible.visualStyle && <p><span className="text-foreground/70">视觉方向：</span>{screenplay.storyBible.visualStyle}</p>}
              </div>
            </div>
          )}

          {screenplay.qualityReport && (
            <div className="rounded-xl border border-border/30 bg-muted/10 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-foreground/85">编剧质检</span>
                <div className="flex items-center gap-1.5">
                  <CopyButton text={qualityReportText} iconOnly title="复制质检报告" />
                  {screenplay.qualityReport.totalScore !== undefined && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                      {screenplay.qualityReport.totalScore}/100
                    </span>
                  )}
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={handleRewriteByQuality}
                    disabled={isRewriting || isExtracting || !selectedModel}
                    className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                  >
                    {isRewriting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                    {isRewriting ? '改稿中' : '按建议改稿'}
                  </button>
                </div>
              </div>
              {screenplay.qualityReport.verdict && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{screenplay.qualityReport.verdict}</p>
              )}
              {screenplay.qualityReport.rewriteSuggestions && screenplay.qualityReport.rewriteSuggestions.length > 0 && (
                <div className="mt-2 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                  {screenplay.qualityReport.rewriteSuggestions.slice(0, 3).map((item, i) => (
                    <p key={i}>• {item}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {rewriteError && !isRewriting && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] text-red-400">
                <AlertCircle className="size-3.5" />
                <span>改稿失败：{rewriteError}</span>
              </div>
            </div>
          )}

          {/* Extraction progress */}
          {isExtracting && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-primary" />
                <span className="text-[12px] text-primary">{isDrama ? 'AI 正在提取全剧资产并生成剧集列表...' : 'AI 正在提取资产并规划分镜表...'}</span>
              </div>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => abortRef.current?.abort()}
                className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500 transition-colors hover:bg-red-600"
                title="中止"
              >
                <div className="size-1.5 rounded-sm bg-white" />
              </button>
            </div>
          )}

          {/* Extraction error */}
          {extractError && !isExtracting && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] text-red-400">
                <AlertCircle className="size-3.5" />
                <span>提取失败：{extractError}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Right: complete screenplay content ── */}
        <div className="min-w-0 flex-1 rounded-xl border border-border/30 bg-muted/10 px-3 py-2.5">
          {isEditing ? (
            <textarea
              onPointerDown={(e) => e.stopPropagation()}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="完整剧本内容…"
              className="min-h-[420px] w-full resize-y rounded-lg border border-border/40 bg-background/60 px-3 py-2.5 text-[12px] leading-relaxed text-foreground/80 outline-none focus:border-primary/40"
            />
          ) : (
            <>
              <div className="flex w-full items-center gap-1.5">
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => setContentExpanded(!contentExpanded)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                >
                  <span className="text-[12px] font-medium text-foreground/80">完整剧本</span>
                  {contentExpanded
                    ? <ChevronDown className="size-3 text-muted-foreground/40" />
                    : <ChevronRight className="size-3 text-muted-foreground/40" />}
                </button>
                <div className="flex-1" />
                <CopyButton text={screenplay.content} iconOnly title="复制完整剧本" />
              </div>
              {contentExpanded && (
                <div className="mt-2.5 max-h-[560px] overflow-y-auto rounded-lg border border-border/20 bg-background/50 px-3 py-2.5">
                  <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/70">
                    {screenplay.content}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Edit mode save/cancel bar */}
      {isEditing && (
        <div className="-mx-3.5 mt-3 flex items-center justify-end gap-2 border-t border-border/40 px-3.5 pt-2.5">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={cancelEdit}
            className="flex items-center gap-1.5 rounded-full border border-border/50 px-3.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40"
          >
            <X className="size-3" />
            取消
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={saveEdit}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95"
          >
            <Save className="size-3" />
            保存修改
          </button>
        </div>
      )}

      {/* Bottom action bar — hidden while editing */}
      <div className={cn('-mx-3.5 mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border/40 px-3.5 pt-2.5', isEditing && 'hidden')}>
        <CopyButton
          text={screenplayToMarkdown(screenplay)}
          label="复制全文"
          className="rounded-full border border-border/50 px-3 py-1.5 font-medium"
          title="复制当前剧本节点全部内容"
        />
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={exportMarkdown}
          className="flex items-center gap-1.5 rounded-full border border-border/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          title="导出稳定 Markdown 剧本文档"
        >
          <FileText className="size-3" />
          导出 MD
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={exportWord}
          className="flex items-center gap-1.5 rounded-full border border-border/50 px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          title="导出 Word 可打开文档"
        >
          <Download className="size-3" />
          导出 Word
        </button>
        {assetExtracted ? (
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Check className="size-3.5" />
              <span>{isDrama ? '资产已提取，剧集列表已生成' : '资产已提取，节点已创建'}</span>
            </div>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => { setAssetExtracted(false); setExtractError(null) }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground"
            >
              <RotateCcw className="size-3" />
              重新提取
            </button>
          </div>
        ) : extractError ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleExtractAssets}
            disabled={isExtracting || !selectedModel}
            className="flex items-center gap-1.5 rounded-full bg-red-500/80 px-3.5 py-1.5 text-[11px] font-medium text-white shadow-md transition-all hover:bg-red-500 active:scale-95"
          >
            <RotateCcw className="size-3" />
            重试提取
          </button>
        ) : !isExtracting ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleExtractAssets}
            disabled={!selectedModel}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[11px] font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
          >
            <Sparkles className="size-3" />
            {isDrama ? '下一步：提取资产 + 生成剧集列表' : '下一步：提取资产 + 规划分镜'}
          </button>
        ) : null}
      </div>
    </NodeBase>
  )
}

export default memo(ScreenplayNode)
