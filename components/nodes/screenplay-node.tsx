'use client'

import { memo, useState, useMemo, useRef, useEffect } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { BookOpen, ChevronDown, ChevronRight, Sparkles, Check, Loader2, AlertCircle, RotateCcw, Pencil, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { useModels } from '@/hooks/use-models'
import { buildDramaAssetExtractionPrompt } from './script-node-prompts'

interface ScreenplayContent {
  title: string
  synopsis: string
  content: string
  scriptDuration?: string
  contentType?: string
  firstHook?: string
  episodeDuration?: number
  characters?: Array<{ name: string; role?: string; appearance?: string; personality?: string }>
  episodes?: Array<{ ep: number; title?: string; hook?: string; beats?: string[]; satisfactionPoint?: string; cliffhanger?: string }>
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
  const [extractError, setExtractError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

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

严格按 JSON 返回，不要有任何其他内容：
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
          body: JSON.stringify({ model: selectedModel, prompt: dp.user, systemPrompt: dp.system, temperature: 0.7, maxTokens: 6000 }),
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

      const res = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt: `【剧本标题】${screenplay.title}\n\n【故事概要】${screenplay.synopsis}\n\n【完整剧本】\n${screenplay.content}`,
          systemPrompt,
          temperature: 0.7,
          maxTokens: 8000,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as Record<string, string>))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }

      const result = await res.json() as { text: string }
      const text = result.text?.trim()
      if (!text) throw new Error('提取结果为空')

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('无法解析 JSON')

      let jsonStr = jsonMatch[0]
      jsonStr = jsonStr
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}')
        .replace(/:\s*undefined/g, ': null')

      let parsed: ReturnType<typeof JSON.parse>
      try {
        parsed = JSON.parse(jsonStr)
      } catch (parseErr) {
        console.error('JSON 解析失败，原始内容:', jsonStr.substring(0, 500))
        throw new Error(`JSON 解析失败: ${parseErr instanceof Error ? parseErr.message : '未知错误'}`)
      }

      if (!parsed.characters || !parsed.storyboard) throw new Error('格式错误：缺少 characters 或 storyboard')

      createAssetsFromExtraction(id, parsed)
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

  return (
    <NodeBase
      nodeId={id}
      nodeType="screenplay"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<BookOpen className="size-3.5" />}
      width="w-[500px]"
    >
      {/* Title + synopsis */}
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
              <h3 className="text-[13px] font-semibold text-foreground">{screenplay.title}</h3>
              {screenplay.synopsis && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{screenplay.synopsis}</p>
              )}
              {screenplay.scriptDuration && (
                <div className="mt-2 text-[11px] text-amber-600">⏱ 时长：{screenplay.scriptDuration}</div>
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

      {/* Complete screenplay content */}
      <div className="mt-2.5 rounded-xl border border-border/30 bg-muted/10 px-3 py-2.5">
        {isEditing ? (
          <textarea
            onPointerDown={(e) => e.stopPropagation()}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="完整剧本内容…"
            className="min-h-[320px] w-full resize-y rounded-lg border border-border/40 bg-background/60 px-3 py-2.5 text-[12px] leading-relaxed text-foreground/80 outline-none focus:border-primary/40"
          />
        ) : (
          <>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setContentExpanded(!contentExpanded)}
              className="flex w-full items-center gap-1.5"
            >
              <span className="text-[12px] font-medium text-foreground/80">完整剧本</span>
              <div className="flex-1" />
              {contentExpanded
                ? <ChevronDown className="size-3 text-muted-foreground/40" />
                : <ChevronRight className="size-3 text-muted-foreground/40" />}
            </button>
            {contentExpanded && (
              <div className="mt-2.5 max-h-[400px] overflow-y-auto rounded-lg border border-border/20 bg-background/50 px-3 py-2.5">
                <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-foreground/70">
                  {screenplay.content}
                </p>
              </div>
            )}
          </>
        )}
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

      {/* Extraction progress */}
      {isExtracting && (
        <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-primary" />
            <span className="text-[12px] text-primary">{isDrama ? 'AI 正在提取全剧资产并生成剧集列表...' : 'AI 正在提取资产并规划分镜表...'}</span>
          </div>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => abortRef.current?.abort()}
            className="flex size-5 items-center justify-center rounded-full bg-red-500 transition-colors hover:bg-red-600"
            title="中止"
          >
            <div className="size-1.5 rounded-sm bg-white" />
          </button>
        </div>
      )}

      {/* Extraction error */}
      {extractError && !isExtracting && (
        <div className="mt-2.5 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5">
          <div className="flex items-center gap-1.5 text-[12px] text-red-400">
            <AlertCircle className="size-3.5" />
            <span>提取失败：{extractError}</span>
          </div>
        </div>
      )}

      {/* Bottom action bar — hidden while editing */}
      <div className={cn('-mx-3.5 mt-3 flex items-center justify-end gap-2 border-t border-border/40 px-3.5 pt-2.5', isEditing && 'hidden')}>
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
