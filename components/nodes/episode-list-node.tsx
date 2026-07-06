'use client'

import { memo, useMemo, useState, useRef, useEffect } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { ListVideo, Sparkles, Loader2, Check, AlertCircle, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { ModelSelector } from '@/components/model-selector'
import { useModels } from '@/hooks/use-models'
import { buildEpisodeStoryboardPrompt } from './script-node-prompts'

interface EpisodeRow {
  ep: number
  title: string
  hook: string
  beats: string[]
  satisfactionPoint: string
  cliffhanger: string
  status: string
  storyboardNodeId: string | null
}

interface ListContent {
  title: string
  episodeDuration: number
  styles: string[]
  characters: Array<{ name: string; role?: string; appearance?: string }>
  locations: string[]
  assetRefs: { chars: Record<string, string>; locs: Record<string, string>; props: Record<string, string> }
  episodes: EpisodeRow[]
}

type EpisodeListNodeProps = NodeProps<Node<CustomNodeData>>

function EpisodeListNode({ id, data, selected }: EpisodeListNodeProps) {
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const createEpisodeStoryboard = useFlowStore((s) => s.createEpisodeStoryboard)

  const { models: textModels } = useModels({ type: 'text' })
  const [selectedModel, setSelectedModel] = useState('')
  useEffect(() => {
    if (textModels.length > 0 && !selectedModel) setSelectedModel(textModels[0].id)
  }, [textModels, selectedModel])

  const content = useMemo<ListContent | null>(() => {
    try { return JSON.parse(data.content as string) } catch { return null }
  }, [data.content])

  // Per-episode transient state (persistent 'done' lives in node content)
  const [genState, setGenState] = useState<Record<number, 'generating' | 'error'>>({})
  const [errorMsg, setErrorMsg] = useState<Record<number, string>>({})
  const abortRefs = useRef<Record<number, AbortController>>({})

  if (!content) return null

  const generateEpisode = async (index: number) => {
    if (!selectedModel || genState[index] === 'generating') return
    const ep = content.episodes[index]
    if (!ep) return

    setGenState((s) => ({ ...s, [index]: 'generating' }))
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
      const res = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, prompt: user, systemPrompt: system, temperature: 0.7, maxTokens: 8000 }),
        signal: controller.signal,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as Record<string, string>))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const { text } = await res.json() as { text: string }
      const m = text?.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('无法解析分镜')
      const jsonStr = m[0].replace(/,\s*\]/g, ']').replace(/,\s*\}/g, '}').replace(/:\s*undefined/g, ': null')
      const parsed = JSON.parse(jsonStr)
      const storyboard = Array.isArray(parsed.storyboard) ? parsed.storyboard : []
      if (storyboard.length === 0) throw new Error('分镜为空，请重试')

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

  const doneCount = content.episodes.filter((e) => e.status === 'done').length

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
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-500">
          <Check className="size-3" />
          {doneCount}/{content.episodes.length}
        </div>
      </div>

      {/* Episode list — `nowheel` lets the wheel scroll this list instead of zooming the canvas */}
      <div className="nowheel mt-2.5 max-h-[560px] space-y-1.5 overflow-y-auto overscroll-contain pr-1">
        {content.episodes.map((ep, i) => {
          const transient = genState[i]
          const isGenerating = transient === 'generating'
          const isError = transient === 'error'
          const isDone = ep.status === 'done'

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
                  <div className="truncate text-[12px] font-medium text-foreground/90">
                    {ep.title || `第${ep.ep}集`}
                  </div>
                  {ep.hook && (
                    <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {ep.hook}
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
                      生成中
                    </button>
                  ) : isDone ? (
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
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => generateEpisode(i)}
                      disabled={!selectedModel}
                      className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
                    >
                      <Sparkles className="size-3" />
                      生成分镜
                    </button>
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
