'use client'

import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { ListVideo, Sparkles, Loader2, Check, AlertCircle, RotateCcw, FileText, Wand2, Save, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { ModelSelector } from '@/components/model-selector'
import { useModels } from '@/hooks/use-models'
import { buildEpisodeRewritePrompt, buildEpisodeScriptPrompt, buildEpisodeStoryboardPrompt } from './script-node-prompts'
import { CopyButton } from '@/components/copy-button'
import { parseDurationSeconds, retimeStoryboardProfessionally } from '@/lib/storyboard-timing'

interface EpisodeRow {
  ep: number
  title: string
  hook: string
  beats: string[]
  satisfactionPoint: string
  cliffhanger: string
  script?: string
  dialogueHighlights?: string[]
  productionNotes?: string[]
  status: string
  storyboardNodeId: string | null
}

interface ListContent {
  title: string
  episodeDuration: number
  styles: string[]
  template?: string
  characters: Array<{ name: string; role?: string; appearance?: string }>
  locations: string[]
  assetRefs: { chars: Record<string, string>; locs: Record<string, string>; props: Record<string, string> }
  episodes: EpisodeRow[]
}

type EpisodeListNodeProps = NodeProps<Node<CustomNodeData>>

function EpisodeListNode({ id, data, selected }: EpisodeListNodeProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const createEpisodeStoryboard = useFlowStore((s) => s.createEpisodeStoryboard)
  const allNodes = useFlowStore((s) => s.nodes)

  const { models: textModels } = useModels({ type: 'text' })
  const [selectedModel, setSelectedModel] = useState('')
  useEffect(() => {
    if (textModels.length > 0 && !selectedModel) setSelectedModel(textModels[0].id)
  }, [textModels, selectedModel])

  const content = useMemo<ListContent | null>(() => {
    try { return JSON.parse(data.content as string) } catch { return null }
  }, [data.content])

  // Per-episode transient state (persistent 'done' lives in node content)
  const [genState, setGenState] = useState<Record<number, 'generating' | 'scripting' | 'rewriting' | 'pilot' | 'error'>>({})
  const [errorMsg, setErrorMsg] = useState<Record<number, string>>({})
  const [editingScript, setEditingScript] = useState<number | null>(null)
  const [scriptDraft, setScriptDraft] = useState('')
  const [isPilotGenerating, setIsPilotGenerating] = useState(false)
  const abortRefs = useRef<Record<number, AbortController>>({})

  if (!content) return null

  const episodeToText = (ep: EpisodeRow) => [
    `第${ep.ep}集 ${ep.title}`,
    ep.hook ? `开场钩子：${ep.hook}` : '',
    ep.beats?.length ? `剧情节点：\n${ep.beats.map((beat, idx) => `${idx + 1}. ${beat}`).join('\n')}` : '',
    ep.satisfactionPoint ? `本集爽点：${ep.satisfactionPoint}` : '',
    ep.cliffhanger ? `结尾悬念：${ep.cliffhanger}` : '',
    ep.script ? `单集剧本：\n${ep.script}` : '',
  ].filter(Boolean).join('\n\n')

  const episodeListText = [
    content.title,
    `共${content.episodes.length}集 · 每集约${content.episodeDuration}s`,
    '',
    ...content.episodes.map(episodeToText),
  ].join('\n\n---\n\n')

  const extractJsonValue = (raw: unknown) => {
    const text = typeof raw === 'string'
      ? raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
      : JSON.stringify(raw)
    if (!text || text === 'undefined' || text === 'null' || text.includes('[object Object]')) return ''
    const objectStart = text.indexOf('{')
    const arrayStart = text.indexOf('[')
    const starts = [objectStart, arrayStart].filter((i) => i >= 0)
    const start = starts.length > 0 ? Math.min(...starts) : -1
    if (start < 0) return ''
    const open = text[start]
    const close = open === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]
      if (inString) {
        if (escaped) {
          escaped = false
        } else if (ch === '\\') {
          escaped = true
        } else if (ch === '"') {
          inString = false
        }
        continue
      }
      if (ch === '"') inString = true
      if (ch === open) depth++
      if (ch === close) {
        depth--
        if (depth === 0) return text.slice(start, i + 1)
      }
    }
    return text.slice(start)
  }

  const parseJson = (text: unknown) => {
    const jsonStr = extractJsonValue(text)
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/,\s*([\]}])/g, '$1')
      .replace(/:\s*undefined/g, ': null')
    if (!jsonStr) throw new Error('无法解析 JSON')
    return JSON.parse(jsonStr)
  }

  const callText = async (system: string, user: string, controller: AbortController, maxTokens = 8000) => {
    const res = await fetch('/api/generate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, prompt: user, systemPrompt: system, temperature: 0.75, maxTokens }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({} as Record<string, string>))
      throw new Error(errBody.error || `HTTP ${res.status}`)
    }
    const payload = await res.json() as { text: unknown }
    const text = typeof payload.text === 'string' ? payload.text : JSON.stringify(payload.text ?? '')
    if (!text.trim()) throw new Error('生成结果为空')
    try {
      return parseJson(text)
    } catch (firstErr) {
      const repairRes = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt: `下面内容不是合法JSON。请在不改写字段含义的前提下修复语法错误，保留原有结构和数据，只返回合法JSON。若内容是分镜数组，请包装为 {"storyboard":[...]}：\n\n${text.slice(0, 18000)}`,
          systemPrompt: '你是JSON修复器。把用户提供的内容修复为严格合法JSON，只返回JSON，不要解释，不要Markdown。尤其要修复字符串值内部未转义的英文双引号，把对白中的英文双引号改成中文引号「」。',
          temperature: 0.05,
          maxTokens,
        }),
        signal: controller.signal,
      })
      if (!repairRes.ok) throw new Error('AI 返回内容不是合法 JSON，请重试')
      const repaired = await repairRes.json() as { text: unknown }
      try {
        return parseJson(repaired.text)
      } catch {
        const strictRes = await fetch('/api/generate/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: selectedModel,
            prompt: `上一次输出仍不是合法JSON。请根据原始需求重新生成，必须只返回一个JSON对象，顶层格式必须是 {"storyboard":[...]}，不要Markdown，不要解释，不要把对象转成[object Object]。\n\n【原始需求】\n${user.slice(0, 12000)}\n\n【错误输出】\n${text.slice(0, 12000)}`,
            systemPrompt: `${system}\n\n重要：这次只允许输出严格合法JSON，顶层必须是 {"storyboard":[...]}。所有字符串内部不要出现未转义英文双引号，台词用中文引号「」。`,
            temperature: 0.35,
            maxTokens,
          }),
          signal: controller.signal,
        })
        if (!strictRes.ok) throw new Error('AI 返回内容不是合法 JSON，请重试')
        const strictPayload = await strictRes.json() as { text: unknown }
        try {
          return parseJson(strictPayload.text)
        } catch {
          throw new Error('AI 返回内容不是合法 JSON，请重试')
        }
      }
    }
  }

  const updateEpisode = (index: number, patch: Partial<EpisodeRow>) => {
    const next = {
      ...content,
      episodes: content.episodes.map((ep, i) => i === index ? { ...ep, ...patch } : ep),
    }
    updateNodeData(id, { content: JSON.stringify(next), status: 'ready' })
  }

  const storyboardDuration = (storyboard: Array<{ duration?: unknown }>) =>
    storyboard.reduce((sum, shot) => sum + parseDurationSeconds(shot.duration), 0)

  const storyboardDialogueCount = (storyboard: Array<{ dialogue?: unknown }>) =>
    storyboard.filter((shot) => typeof shot.dialogue === 'string' && shot.dialogue.trim()).length

  const ensureStoryboardDialogue = async (
    storyboard: Array<Record<string, unknown>>,
    ep: EpisodeRow,
    controller: AbortController,
  ) => {
    const dialogueCount = storyboardDialogueCount(storyboard)
    const minDialogueShots = Math.max(3, Math.ceil(storyboard.length * 0.35))
    if (dialogueCount >= minDialogueShots) return storyboard

    const revised = await callText(
      `你是短剧对白分镜修订师。你的任务不是重写分镜，而是在保留镜头顺序、画面、站位、动作、机位和时长的前提下，给关键镜头补上短剧对白/旁白。

硬规则：
- 必须返回严格JSON：{"storyboard":[...]}
- 不许删除、合并、重排镜头；shot、duration、description、blocking、action、expression、cameraAngle、composition、shotType、camera必须保留原意
- 至少${minDialogueShots}个镜头的dialogue不能为空
- 开场钩子镜头、压迫/质问镜头、反击爽点镜头、结尾悬念镜头必须有dialogue
- dialogue要短、狠、口语化、有对抗或潜台词；单条不超过28个汉字
- 不要每个镜头都说话，动作/反应镜头可以为空
- 字符串值内部不要使用英文双引号 "，对白引用用中文引号「」`,
      `【剧名】${content.title}
【本集】第${ep.ep}集 ${ep.title}
【开场钩子】${ep.hook ?? ''}
【剧情节点】${(ep.beats ?? []).join('；')}
【本集爽点】${ep.satisfactionPoint ?? ''}
【结尾悬念】${ep.cliffhanger ?? ''}
${ep.script ? `【单集剧本】\n${ep.script}\n` : ''}
【当前分镜】
${JSON.stringify(storyboard, null, 2)}

请只补足关键对白/旁白，返回完整storyboard。`,
      controller,
      10000,
    )

    const next = Array.isArray(revised) ? revised : Array.isArray(revised.storyboard) ? revised.storyboard : storyboard
    return Array.isArray(next) && next.length > 0 ? next : storyboard
  }

  const generateEpisode = async (index: number, state: 'generating' | 'pilot' = 'generating', episodeOverride?: EpisodeRow) => {
    if (!selectedModel || genState[index] === 'generating' || genState[index] === 'pilot') return
    const ep = episodeOverride ?? content.episodes[index]
    if (!ep) return

    setGenState((s) => ({ ...s, [index]: state }))
    setErrorMsg((s) => { const n = { ...s }; delete n[index]; return n })

    const controller = new AbortController()
    abortRefs.current[index] = controller

    try {
      const { system, user } = buildEpisodeStoryboardPrompt({
        title: content.title,
        episode: ep,
        episodeDuration: content.episodeDuration,
        characters: content.characters,
        locations: content.locations,
      })
      const parsed = await callText(system, user, controller)
      let storyboard = Array.isArray(parsed) ? parsed : Array.isArray(parsed.storyboard) ? parsed.storyboard : []
      if (storyboard.length === 0) throw new Error('分镜为空，请重试')
      storyboard = await ensureStoryboardDialogue(storyboard, ep, controller)
      storyboard = retimeStoryboardProfessionally(storyboard, content.episodeDuration)
      const minTotal = Math.max(1, content.episodeDuration - 5)
      if (storyboardDuration(storyboard) < minTotal) {
        const expanded = await callText(
          `你是短剧分镜修订师。把已有分镜扩写到目标总时长，必须返回严格JSON。

规则：
- 目标总时长：${content.episodeDuration}秒
- 所有storyboard.duration相加必须在${minTotal}-${content.episodeDuration + 5}秒之间
- 禁止平均分配时长，不能全部写成4s/5s/6s
- 按镜头功能估时：反应/眼神/动作瞬间2-3秒；普通动作推进3-5秒；对白交锋/复杂调度5-8秒；关键悬念或情绪落点可6-9秒
- 保留原剧情顺序，增加必要的反应镜头、动作推进、压迫细节和悬念铺垫
- 每个镜头必须包含description、blocking、action、expression、cameraAngle、composition、shotType、camera
- dialogue不能全部为空，至少35%的镜头要有短台词/旁白；开场钩子、冲突压迫、反击爽点、结尾悬念镜头必须有dialogue
- 返回格式：{"storyboard":[...]}`,
          `【剧名】${content.title}
【本集】第${ep.ep}集 ${ep.title}
【原始分镜总时长】${storyboardDuration(storyboard)}秒
【原始分镜】
${JSON.stringify(storyboard, null, 2)}

请扩写/调整为完整${content.episodeDuration}秒分镜。`,
          controller,
          10000,
        )
        storyboard = Array.isArray(expanded) ? expanded : Array.isArray(expanded.storyboard) ? expanded.storyboard : storyboard
        storyboard = await ensureStoryboardDialogue(storyboard, ep, controller)
        storyboard = retimeStoryboardProfessionally(storyboard, content.episodeDuration)
      }
      if (storyboardDuration(storyboard) < minTotal) {
        throw new Error(`分镜总时长不足：需要约${content.episodeDuration}秒，实际${storyboardDuration(storyboard)}秒`)
      }

      createEpisodeStoryboard(id, index, storyboard)
      // content update flips this episode to 'done' → clear transient state
      setGenState((s) => { const n = { ...s }; delete n[index]; return n })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setGenState((s) => { const n = { ...s }; delete n[index]; return n })
        return
      }
      setGenState((s) => ({ ...s, [index]: 'error' }))
      setErrorMsg((s) => ({ ...s, [index]: err instanceof Error ? err.message : '生成失败' }))
    } finally {
      delete abortRefs.current[index]
    }
  }

  const generateEpisodeScript = async (index: number, state: 'scripting' | 'pilot' = 'scripting') => {
    if (!selectedModel || genState[index] === 'scripting' || genState[index] === 'pilot') return
    const ep = content.episodes[index]
    if (!ep) return

    setGenState((s) => ({ ...s, [index]: state }))
    setErrorMsg((s) => { const n = { ...s }; delete n[index]; return n })

    const controller = new AbortController()
    abortRefs.current[index] = controller

    try {
      const { system, user } = buildEpisodeScriptPrompt({
        title: content.title,
        episode: ep,
        episodeDuration: content.episodeDuration,
        characters: content.characters,
        locations: content.locations,
      })
      const parsed = await callText(system, user, controller, 9000)
      const script = typeof parsed.script === 'string' ? parsed.script.trim() : ''
      if (!script) throw new Error('单集剧本为空，请重试')
      const nextEp: EpisodeRow = {
        ...ep,
        script,
        dialogueHighlights: Array.isArray(parsed.dialogueHighlights) ? parsed.dialogueHighlights : [],
        productionNotes: Array.isArray(parsed.productionNotes) ? parsed.productionNotes : [],
        status: 'idle',
        storyboardNodeId: null,
      }
      updateEpisode(index, nextEp)
      await generateEpisode(index, state === 'pilot' ? 'pilot' : 'generating', nextEp)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setGenState((s) => { const n = { ...s }; delete n[index]; return n })
        return
      }
      setGenState((s) => ({ ...s, [index]: 'error' }))
      setErrorMsg((s) => ({ ...s, [index]: err instanceof Error ? err.message : '生成失败' }))
    } finally {
      delete abortRefs.current[index]
    }
  }

  const rewriteEpisode = async (index: number) => {
    if (!selectedModel || genState[index] === 'rewriting') return
    const ep = content.episodes[index]
    if (!ep) return

    setGenState((s) => ({ ...s, [index]: 'rewriting' }))
    setErrorMsg((s) => { const n = { ...s }; delete n[index]; return n })

    const controller = new AbortController()
    abortRefs.current[index] = controller

    try {
      const { system, user } = buildEpisodeRewritePrompt({
        title: content.title,
        episode: ep,
        episodeDuration: content.episodeDuration,
        template: content.template,
      })
      const parsed = await callText(system, user, controller, 5000)
      updateEpisode(index, {
        title: parsed.title ?? ep.title,
        hook: parsed.hook ?? ep.hook,
        beats: Array.isArray(parsed.beats) ? parsed.beats : ep.beats,
        satisfactionPoint: parsed.satisfactionPoint ?? ep.satisfactionPoint,
        cliffhanger: parsed.cliffhanger ?? ep.cliffhanger,
        script: '',
        dialogueHighlights: [],
        productionNotes: [],
      })
      setGenState((s) => { const n = { ...s }; delete n[index]; return n })
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setGenState((s) => { const n = { ...s }; delete n[index]; return n })
        return
      }
      setGenState((s) => ({ ...s, [index]: 'error' }))
      setErrorMsg((s) => ({ ...s, [index]: err instanceof Error ? err.message : '重写失败' }))
    } finally {
      delete abortRefs.current[index]
    }
  }

  const startScriptEdit = (index: number, script: string) => {
    setEditingScript(index)
    setScriptDraft(script)
  }

  const saveScriptEdit = async () => {
    if (editingScript === null) return
    const ep = content.episodes[editingScript]
    if (!ep) return
    const nextEp: EpisodeRow = {
      ...ep,
      script: scriptDraft,
      status: 'idle',
      storyboardNodeId: null,
    }
    updateEpisode(editingScript, nextEp)
    await generateEpisode(editingScript, 'generating', nextEp)
    setEditingScript(null)
    setScriptDraft('')
  }

  const generatePilotPack = async () => {
    if (!selectedModel || isPilotGenerating) return
    setIsPilotGenerating(true)
    try {
      const count = Math.min(3, content.episodes.length)
      for (let i = 0; i < count; i++) {
        if (!content.episodes[i]?.script) {
          await generateEpisodeScript(i, 'pilot')
        } else if (content.episodes[i]?.status !== 'done' || !content.episodes[i]?.storyboardNodeId) {
          await generateEpisode(i, 'pilot')
        }
      }
    } finally {
      setIsPilotGenerating(false)
    }
  }

  const doneCount = content.episodes.filter((e) => e.status === 'done' && e.storyboardNodeId).length

  return (
    <NodeBase
      nodeId={id}
      nodeType="episodeList"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<ListVideo className="size-3.5" />}
      width="w-[420px]"
    >
      {/* Summary bar */}
      <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3.5 py-2.5">
        <div className="flex flex-col">
          <span className="text-[12px] font-semibold text-foreground">{content.title || '剧集列表'}</span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">
            共 {content.episodes.length} 集 · 每集约 {content.episodeDuration}s · {content.characters.length} 角色 / {content.locations.length} 场景
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <CopyButton text={episodeListText} iconOnly title="复制全部剧集大纲" />
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={generatePilotPack}
            disabled={!selectedModel || isPilotGenerating}
            className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-500 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
          >
            {isPilotGenerating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            前3集试播
          </button>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500">
            <Check className="size-3" />
            {doneCount}/{content.episodes.length}
          </div>
        </div>
      </div>

      {/* Episode list — `nowheel` lets the wheel scroll this list instead of zooming the canvas */}
      <div className="nowheel mt-2.5 max-h-[560px] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
        {content.episodes.map((ep, i) => {
          const transient = genState[i]
          const isGenerating = transient === 'generating' || transient === 'scripting' || transient === 'rewriting' || transient === 'pilot'
          const isError = transient === 'error'
          const storyboardExists = !!ep.storyboardNodeId && allNodes.some((node) => node.id === ep.storyboardNodeId)
          const isDone = ep.status === 'done' && storyboardExists
          const statusLabel = transient === 'scripting' ? '写剧本'
            : transient === 'rewriting' ? '重写中'
            : transient === 'pilot' ? '试播中'
            : '生成中'

          return (
            <div
              key={ep.ep ?? i}
              className={cn(
                'rounded-xl border px-3 py-2.5 transition-colors',
                isDone ? 'border-emerald-500/25 bg-emerald-500/5'
                  : isError ? 'border-red-500/25 bg-red-500/5'
                  : 'border-border/40 bg-muted/10',
              )}
            >
              <div className="flex items-start gap-2.5">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary">
                  {ep.ep}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    <div className="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground/90">
                      {ep.title || `第${ep.ep}集`}
                    </div>
                    <CopyButton text={episodeToText(ep)} iconOnly title={`复制第${ep.ep}集`} className="-mt-1" />
                  </div>
                  {ep.hook && (
                    <div className="mt-0.5 flex items-start gap-1">
                      <div className="min-w-0 flex-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {ep.hook}
                      </div>
                      <CopyButton text={ep.hook} iconOnly title="复制开场钩子" className="mt-0.5 size-5" />
                    </div>
                  )}
                  {ep.script && editingScript !== i && (
                    <div className="mt-2 rounded-lg border border-border/25 bg-background/45 px-2.5 py-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] font-medium text-foreground/60">单集剧本</span>
                        <div className="flex items-center gap-1">
                          <CopyButton text={ep.script} iconOnly title="复制单集剧本" className="size-5" />
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => startScriptEdit(i, ep.script ?? '')}
                            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            编辑
                          </button>
                        </div>
                      </div>
                      <p className="line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-muted-foreground">
                        {ep.script}
                      </p>
                    </div>
                  )}
                  {editingScript === i && (
                    <div className="mt-2 rounded-lg border border-primary/25 bg-background/60 p-2">
                      <textarea
                        value={scriptDraft}
                        onChange={(e) => setScriptDraft(e.target.value)}
                        onPointerDown={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="nodrag nopan min-h-[180px] w-full resize-y rounded-md border border-border/40 bg-background px-2.5 py-2 text-[11px] leading-relaxed text-foreground outline-none focus:border-primary/50"
                      />
                      <div className="mt-2 flex justify-end gap-1.5">
                        <CopyButton text={scriptDraft} label="复制" className="rounded-full border border-border/40 px-2.5 py-1 text-[10px]" />
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={() => { setEditingScript(null); setScriptDraft('') }}
                          className="flex items-center gap-1 rounded-full border border-border/40 px-2.5 py-1 text-[10px] text-muted-foreground hover:bg-muted/30"
                        >
                          <X className="size-3" />
                          取消
                        </button>
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={saveScriptEdit}
                          className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground"
                        >
                          <Save className="size-3" />
                          保存
                        </button>
                      </div>
                    </div>
                  )}
                  {isError && errorMsg[i] && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-red-400">
                      <AlertCircle className="size-3" />
                      {errorMsg[i]}
                    </div>
                  )}
                </div>

                {/* Action */}
                <div className="shrink-0">
                  {isGenerating ? (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => abortRefs.current[i]?.abort()}
                      className="flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-400"
                      title="点击中止"
                    >
                      <Loader2 className="size-3 animate-spin" />
                      {statusLabel}
                    </button>
                  ) : isDone ? (
                    <div className="flex flex-col gap-1">
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => generateEpisodeScript(i)}
                        disabled={!selectedModel}
                        className="flex items-center gap-1 rounded-full border border-border/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 disabled:opacity-40"
                      >
                        <FileText className="size-3" />
                        {ep.script ? '重写剧本' : '单集剧本'}
                      </button>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => generateEpisode(i)}
                        disabled={!selectedModel}
                        className="flex items-center gap-1 rounded-full border border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-500 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                        title="重新生成分镜"
                      >
                        <Check className="size-3" />
                        已生成
                      </button>
                    </div>
                  ) : isError ? (
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => generateEpisode(i)}
                      disabled={!selectedModel}
                      className="flex items-center gap-1 rounded-full bg-red-500/80 px-2.5 py-1 text-[11px] font-medium text-white transition-all hover:bg-red-500 active:scale-95 disabled:opacity-40"
                    >
                      <RotateCcw className="size-3" />
                      重试
                    </button>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => generateEpisodeScript(i)}
                        disabled={!selectedModel}
                        className="flex items-center gap-1 rounded-full border border-border/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/30 disabled:opacity-40"
                      >
                        <FileText className="size-3" />
                        {ep.script ? '重写剧本' : '单集剧本'}
                      </button>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => rewriteEpisode(i)}
                        disabled={!selectedModel}
                        className="flex items-center gap-1 rounded-full border border-amber-500/30 px-2.5 py-1 text-[11px] font-medium text-amber-500 transition-colors hover:bg-amber-500/10 disabled:opacity-40"
                      >
                        <Wand2 className="size-3" />
                        重写
                      </button>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => generateEpisode(i)}
                        disabled={!selectedModel}
                        className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
                      >
                        <Sparkles className="size-3" />
                        生成分镜
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Model selector */}
      <div className="-mx-3.5 mt-3 flex items-center gap-2 border-t border-border/40 px-3.5 pt-2.5">
        <ModelSelector models={textModels} selected={selectedModel} onSelect={setSelectedModel} />
        <div className="flex-1" />
        <span className="text-[11px] text-muted-foreground/60">逐集生成分镜</span>
      </div>
    </NodeBase>
  )
}

export default memo(EpisodeListNode)
