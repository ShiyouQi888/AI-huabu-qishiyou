'use client'

import { memo, useState } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { Lightbulb, Copy, CheckCheck, Layout, Palette, AlignLeft, Type, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { cn } from '@/lib/utils'

interface BriefMeta {
  designType?: string
  ratio?: string
  creativeDirection?: string
  composition?: string
  colorScheme?: string
  copywriting?: string
  negativePrompt?: string
}

const SECTIONS = [
  { key: 'creativeDirection' as const, label: '创意方向', icon: Lightbulb,  border: 'border-violet-500/20', bg: 'bg-violet-500/5',  labelColor: 'text-violet-500/70',  textColor: 'text-violet-300/90' },
  { key: 'composition'       as const, label: '构图建议', icon: Layout,      border: 'border-blue-500/20',   bg: 'bg-blue-500/5',    labelColor: 'text-blue-500/70',    textColor: 'text-blue-300/90' },
  { key: 'colorScheme'       as const, label: '配色方案', icon: Palette,     border: 'border-pink-500/20',   bg: 'bg-pink-500/5',    labelColor: 'text-pink-500/70',    textColor: 'text-pink-300/90' },
  { key: 'copywriting'       as const, label: '文案建议', icon: Type,        border: 'border-amber-500/20',  bg: 'bg-amber-500/5',   labelColor: 'text-amber-500/70',   textColor: 'text-amber-300/90' },
]

type GraphicBriefNodeProps = NodeProps<Node<CustomNodeData>>

function GraphicBriefNode({ id, data, selected }: GraphicBriefNodeProps) {
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  const brief: BriefMeta = (() => {
    try { return JSON.parse(data.meta as string) as BriefMeta }
    catch { return {} }
  })()

  const prompt = (data.content as string) || ''

  const handleCopy = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const visibleSections = SECTIONS.filter(s => !!brief[s.key])

  return (
    <NodeBase
      nodeId={id}
      nodeType="graphicBrief"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<Lightbulb className="size-3.5" />}
      hasInput={true}
      hasOutput={true}
      width="w-[420px]"
      badge={
        brief.designType ? (
          <div className="flex items-center gap-1.5">
            <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-400">
              {brief.designType}
            </span>
            {brief.ratio && (
              <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground/60">
                {brief.ratio}
              </span>
            )}
          </div>
        ) : undefined
      }
    >
      {/* Collapse toggle */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => setCollapsed(!collapsed)}
        className="nodrag nopan mb-2.5 flex w-full items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        {collapsed
          ? <ChevronRight className="size-3" />
          : <ChevronDown className="size-3" />}
        {collapsed ? '展开创意详情' : '收起创意详情'}
      </button>

      {/* Creative plan sections */}
      {!collapsed && (
        <div className="nodrag nopan space-y-2">
          {visibleSections.map(({ key, label, icon: Icon, border, bg, labelColor, textColor }) => (
            <div key={key} className={cn('rounded-xl border p-2.5', border, bg)}>
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className={cn('size-3', labelColor)} />
                  <span className={cn('text-[10px] font-semibold uppercase tracking-wider', labelColor)}>{label}</span>
                </div>
                <button
                  onClick={() => handleCopy(brief[key]!, key)}
                  className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] text-muted-foreground/40 hover:bg-muted/30 transition-colors"
                >
                  {copiedField === key ? <CheckCheck className="size-3" /> : <Copy className="size-3" />}
                </button>
              </div>
              <p className={cn('text-[11px] leading-relaxed whitespace-pre-line', textColor)}>{brief[key]}</p>
            </div>
          ))}
        </div>
      )}

      {/* Prompt — always visible, it's the output */}
      {prompt && (
        <div className={cn('rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5', !collapsed && 'mt-2')}>
          <div className="mb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-3 text-emerald-500/70" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500/70">
                生图提示词
              </span>
              <span className="rounded-md bg-emerald-500/15 px-1 py-0.5 text-[9px] text-emerald-500/60">
                已接 AI 生图
              </span>
            </div>
            <button
              onClick={() => handleCopy(prompt, 'prompt')}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-emerald-500/60 hover:bg-emerald-500/10 transition-colors"
            >
              {copiedField === 'prompt'
                ? <><CheckCheck className="size-3 text-emerald-500" /> 已复制</>
                : <><Copy className="size-3" /> 复制</>}
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-emerald-400/80 line-clamp-4">{prompt}</p>
        </div>
      )}

      {/* Negative prompt — collapsed by default */}
      {brief.negativePrompt && !collapsed && (
        <div className="mt-2 rounded-xl border border-border/30 bg-muted/10 p-2.5">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <AlignLeft className="size-3 text-muted-foreground/40" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">反向提示词</span>
            </div>
            <button
              onClick={() => handleCopy(brief.negativePrompt!, 'negativePrompt')}
              className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[10px] text-muted-foreground/40 hover:bg-muted/30 transition-colors"
            >
              {copiedField === 'negativePrompt' ? <CheckCheck className="size-3" /> : <Copy className="size-3" />}
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground/50 line-clamp-3">{brief.negativePrompt}</p>
        </div>
      )}
    </NodeBase>
  )
}

export default memo(GraphicBriefNode)
