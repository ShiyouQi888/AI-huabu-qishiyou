'use client'

import { memo, useState, useEffect, useRef, useCallback } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import {
  LayoutTemplate, Sparkles, Loader2, Palette, ChevronDown, ChevronRight,
  RotateCcw, Plus, Check,
  ShoppingBag, FileImage, AlignJustify, LayoutDashboard, User, Monitor, CreditCard, Package,
  Image as ImageIcon, Layers, Star,
} from 'lucide-react'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { ModelSelector } from '@/components/model-selector'
import { NodeBase } from './node-base'
import { useModels } from '@/hooks/use-models'
import { cn } from '@/lib/utils'

// ratio: 映射到 image-node 支持的比例
const DESIGN_TYPES = [
  { id: '电商主图', label: '电商主图', icon: ShoppingBag,    ratio: '1:1',  genRatio: '1:1'  as const, needsUpload: true,  color: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: '海报',    label: '海报',    icon: FileImage,        ratio: '2:3',  genRatio: '3:4'  as const, needsUpload: false, color: 'text-pink-400',   bg: 'bg-pink-500/10' },
  { id: '详情页',  label: '详情页',  icon: AlignJustify,     ratio: '竖版', genRatio: '9:16' as const, needsUpload: true,  color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  { id: 'Banner图', label: 'Banner', icon: LayoutDashboard,  ratio: '16:5', genRatio: '16:9' as const, needsUpload: true,  color: 'text-teal-400',   bg: 'bg-teal-500/10' },
  { id: '形象照',  label: '形象照',  icon: User,             ratio: '3:4',  genRatio: '3:4'  as const, needsUpload: false, color: 'text-violet-400', bg: 'bg-violet-500/10' },
  { id: '社交封面', label: '社交封面', icon: Monitor,        ratio: '16:9', genRatio: '16:9' as const, needsUpload: false, color: 'text-sky-400',    bg: 'bg-sky-500/10' },
  { id: '名片',    label: '名片',   icon: CreditCard,        ratio: '横版', genRatio: '4:3'  as const, needsUpload: false, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  { id: '包装设计', label: '包装设计', icon: Package,        ratio: '自定义', genRatio: '1:1' as const, needsUpload: true,  color: 'text-amber-400',  bg: 'bg-amber-500/10' },
] as const

const REF_TYPES = [
  { label: '产品图',   nodeLabel: '产品图',   icon: ShoppingBag },
  { label: '品牌Logo', nodeLabel: '品牌Logo', icon: Star },
  { label: '风格参考', nodeLabel: '风格参考', icon: Layers },
  { label: '人物形象', nodeLabel: '人物形象', icon: User },
  { label: '场景背景', nodeLabel: '场景背景', icon: ImageIcon },
]

const STYLE_OPTIONS = [
  '极简现代', '奢华高端', '国潮复古', '科技感', '活力运动',
  '温馨治愈', '商务专业', '可爱卡通', '自然清新', '赛博朋克',
  '波普艺术', '日式极简', '欧美大片', '中式古典',
]

interface GraphicResult {
  creativeDirection: string
  composition: string
  colorScheme: string
  copywriting: string
  prompt: string
  negativePrompt: string
}

type GraphicNodeProps = NodeProps<Node<CustomNodeData>>

function GraphicNode({ id, data, selected }: GraphicNodeProps) {
  const updateNodeData        = useFlowStore((s) => s.updateNodeData)
  const deleteNode            = useFlowStore((s) => s.deleteNode)
  const createGraphicWorkflow = useFlowStore((s) => s.createGraphicWorkflow)
  const addInputNode          = useFlowStore((s) => s.addInputNode)

  const [designType, setDesignType] = useState<string>(() => {
    try { return (JSON.parse(data.meta as string) as { designType?: string }).designType ?? '' }
    catch { return '' }
  })
  const [requirement, setRequirement] = useState(data.content || '')
  const [styles, setStyles] = useState<string[]>(() => {
    try { return (JSON.parse(data.meta as string) as { styles?: string[] }).styles ?? [] }
    catch { return [] }
  })
  const [styleExpanded, setStyleExpanded] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<GraphicResult | null>(() => {
    try {
      const meta = JSON.parse(data.meta as string) as { result?: GraphicResult }
      return meta.result ?? null
    } catch { return null }
  })
  const [createdImgNodeId, setCreatedImgNodeId] = useState<string>(() => {
    try { return (JSON.parse(data.meta as string) as { imgNodeId?: string }).imgNodeId ?? '' }
    catch { return '' }
  })
  const abortRef = useRef<AbortController | null>(null)

  const { models: textModels } = useModels({ type: 'text' })
  const [selectedModel, setSelectedModel] = useState('')
  useEffect(() => {
    if (textModels.length > 0 && !selectedModel) setSelectedModel(textModels[0].id)
  }, [textModels, selectedModel])

  const persistMeta = useCallback((dt: string, st: string[], res: GraphicResult | null, imgId?: string) => {
    updateNodeData(id, { meta: JSON.stringify({ designType: dt, styles: st, result: res, imgNodeId: imgId ?? createdImgNodeId }) })
  }, [id, updateNodeData, createdImgNodeId])

  const handleDesignTypeChange = (t: string) => {
    setDesignType(t)
    persistMeta(t, styles, result)
  }

  const toggleStyle = (s: string) => {
    const next = styles.includes(s) ? styles.filter(v => v !== s) : [...styles, s]
    setStyles(next)
    persistMeta(designType, next, result)
  }

  const handleRequirementChange = (value: string) => {
    setRequirement(value)
    updateNodeData(id, { content: value, status: value.trim() ? 'ready' : 'idle' })
  }

  const currentType = DESIGN_TYPES.find(t => t.id === designType)

  const handleGenerate = async () => {
    if (!requirement.trim() || isGenerating || !selectedModel) return
    setIsGenerating(true)
    setResult(null)
    updateNodeData(id, { status: 'generating' })

    const controller = new AbortController()
    abortRef.current = controller

    const typeHint = currentType
      ? `设计类型：${currentType.id}（推荐比例 ${currentType.ratio}）`
      : '设计类型：通用平面设计'

    const styleHint = styles.length > 0
      ? `\n参考风格：${styles.join('、')}`
      : ''

    const systemPrompt = `你是专业的平面设计创意总监和提示词工程师。根据用户的设计需求，生成完整的创意方案。

${typeHint}${styleHint}

你的任务：
1. 分析需求，提出清晰的创意方向（主题、视觉概念）
2. 设计构图布局方案（主体位置、视觉层次、留白处理）
3. 制定配色方案（主色、辅色、点缀色，及搭配理由）
4. 提供文案建议（标题、副标题、卖点等）
5. 生成适合 AI 生图工具的中文正向提示词（150-200字，细致描述画面主体、构图、光线、材质、色调、风格等）
6. 生成中文反向提示词（描述需要避免出现的元素）

严格按 JSON 格式返回，不要包含任何 Markdown 代码块标记：
{"creativeDirection":"创意方向和核心概念（2-3句话）","composition":"构图建议（具体描述画面布局、主体位置、视觉动线）","colorScheme":"配色方案（列出主色/辅色/点缀色及使用比例）","copywriting":"文案建议（标题+副标题+核心卖点，分行列出）","prompt":"详细的中文生图提示词（主体、构图、光线、材质、色调、风格）","negativePrompt":"中文反向提示词（需要避免的元素）"}`

    try {
      const res = await fetch('/api/generate/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          prompt: requirement,
          systemPrompt,
          temperature: 0.8,
          maxTokens: 4000,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as Record<string, string>))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }

      const data2 = await res.json() as { text: string }
      const text = data2.text?.trim()
      if (!text) throw new Error('生成结果为空')

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('无法解析 JSON')

      let jsonStr = jsonMatch[0]
        .replace(/,\s*\]/g, ']')
        .replace(/,\s*\}/g, '}')

      const parsed = JSON.parse(jsonStr) as GraphicResult
      if (!parsed.prompt) throw new Error('格式错误：缺少 prompt')

      setResult(parsed)
      persistMeta(designType, styles, parsed)
      updateNodeData(id, { content: parsed.prompt, status: 'completed' })

      // 自动创建后续工作流节点
      const typeInfo = DESIGN_TYPES.find((t) => t.id === designType)
      const imgNodeId = createGraphicWorkflow(id, {
        designType,
        prompt: parsed.prompt,
        negativePrompt: parsed.negativePrompt ?? '',
        ratio: typeInfo?.genRatio ?? '1:1',
        needsProductUpload: typeInfo?.needsUpload ?? false,
        creativeDirection: parsed.creativeDirection,
        composition: parsed.composition,
        colorScheme: parsed.colorScheme,
        copywriting: parsed.copywriting,
      })
      setCreatedImgNodeId(imgNodeId)
      persistMeta(designType, styles, parsed, imgNodeId)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('创意方案生成失败:', err)
      updateNodeData(id, { status: 'failed' })
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }

  const handleReset = () => {
    setResult(null)
    setCreatedImgNodeId('')
    persistMeta(designType, styles, null, '')
    updateNodeData(id, { status: requirement.trim() ? 'ready' : 'idle' })
  }

  const canGenerate = !isGenerating && !!requirement.trim() && !!selectedModel

  return (
    <NodeBase
      nodeId={id}
      nodeType="graphic"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<LayoutTemplate className="size-3.5" />}
      width="w-[380px]"
    >
      {/* Design type grid */}
      <div className="nodrag nopan">
        <div className="mb-2 text-[11px] font-medium text-muted-foreground/60">选择设计类型</div>
        <div className="grid grid-cols-4 gap-1.5">
          {DESIGN_TYPES.map((type) => {
            const Icon = type.icon
            const active = designType === type.id
            return (
              <button
                key={type.id}
                onClick={() => handleDesignTypeChange(type.id)}
                onPointerDown={(e) => e.stopPropagation()}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border py-2 px-1 text-center transition-all duration-150',
                  active
                    ? `${type.bg} border-current/30 ${type.color}`
                    : 'border-border/30 bg-muted/20 text-muted-foreground/60 hover:bg-muted/40 hover:text-foreground/70'
                )}
              >
                <Icon className={cn('size-3.5', active ? type.color : '')} />
                <span className="text-[10px] font-medium leading-tight">{type.label}</span>
                <span className="text-[9px] opacity-60">{type.ratio}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Requirement input */}
      <div className="nodrag nopan mt-2.5 rounded-xl border border-border/50 bg-muted/20 transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20">
        <textarea
          value={requirement}
          onChange={(e) => handleRequirementChange(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={designType
            ? `描述您的${designType}需求，例如：产品特点、目标人群、品牌调性...`
            : '选择设计类型后，描述您的设计需求和核心卖点...'}
          rows={3}
          className="nodrag nopan block w-full resize-none bg-transparent px-3.5 py-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
        />
      </div>

      {/* Style picker */}
      <div className="nodrag nopan mt-2.5" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button onClick={() => setStyleExpanded(!styleExpanded)} className="flex items-center gap-1.5">
            <Palette className="size-3 text-muted-foreground/50" />
            <span className="text-[12px] font-medium text-muted-foreground/70">设计风格</span>
            {styles.length > 0 && (
              <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">{styles.length}</span>
            )}
            {styleExpanded
              ? <ChevronDown className="size-3 text-muted-foreground/40" />
              : <ChevronRight className="size-3 text-muted-foreground/40" />}
          </button>
        </div>

        {!styleExpanded && styles.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {styles.map(s => (
              <span key={s} className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{s}</span>
            ))}
          </div>
        )}

        {styleExpanded && (
          <div className="mt-2 rounded-xl border border-border/30 bg-muted/10 p-2.5" onKeyDown={(e) => e.stopPropagation()}>
            <div className="flex flex-wrap gap-1">
              {STYLE_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => toggleStyle(s)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11px] transition-colors',
                    styles.includes(s)
                      ? 'bg-primary/20 text-primary ring-1 ring-primary/30'
                      : 'bg-muted/40 text-foreground/60 hover:bg-muted/60'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Generating state */}
      {isGenerating && (
        <div className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 py-3">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span className="text-[12px] text-primary">AI 正在规划创意方案...</span>
        </div>
      )}

      {/* Result — 简洁完成状态，详细内容在创意方案节点中展示 */}
      {result && !isGenerating && (
        <div className="mt-2.5 space-y-2">
          {/* 完成提示 */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3">
            <div className="flex items-center gap-2 mb-1">
              <Check className="size-3.5 shrink-0 text-emerald-500" />
              <span className="text-[12px] font-medium text-emerald-400">创意方案已生成</span>
            </div>
            <p className="text-[11px] text-emerald-600/60 leading-relaxed">
              已在画布右侧创建「创意方案」展示节点和「AI 生图」节点，并完成连线。
            </p>
          </div>

          {/* 添加参考素材 */}
          {createdImgNodeId && (
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/5 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Layers className="size-3 text-muted-foreground/50" />
                <span className="text-[11px] font-medium text-muted-foreground/70">添加参考素材</span>
                <span className="text-[10px] text-muted-foreground/35">连接至 AI 生图</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {REF_TYPES.map(({ label, nodeLabel, icon: Icon }) => (
                  <button
                    key={label}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => addInputNode(
                      createdImgNodeId,
                      'image',
                      { label: nodeLabel, mode: 'input', status: 'idle' },
                      'tab-imgref',
                    )}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-border/50 bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground/70 transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary active:scale-95"
                  >
                    <Plus className="size-3" />
                    <Icon className="size-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div className="-mx-3.5 mt-3 flex items-center gap-1.5 border-t border-border/40 px-3.5 pt-2.5">
        <ModelSelector models={textModels} selected={selectedModel} onSelect={setSelectedModel} />
        <div className="flex-1" />

        {isGenerating ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => abortRef.current?.abort()}
            className="flex size-7 items-center justify-center rounded-full bg-red-500 shadow-md shadow-red-500/20 transition-all hover:bg-red-600 active:scale-95"
            title="中止生成"
          >
            <div className="size-2.5 rounded-sm bg-white" />
          </button>
        ) : result ? (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleReset}
            title="重新规划"
            className="flex items-center gap-1.5 rounded-full border border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/30"
          >
            <RotateCcw className="size-3" />
            重新规划
          </button>
        ) : (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleGenerate}
            disabled={!canGenerate}
            title="AI 规划创意方案"
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40"
          >
            <Sparkles className="size-3" />
            规划创意
          </button>
        )}
      </div>
    </NodeBase>
  )
}

export default memo(GraphicNode)
