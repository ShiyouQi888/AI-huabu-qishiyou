'use client'

import { Fragment, memo, useEffect, useRef, useState } from 'react'
import { Node, NodeProps } from '@xyflow/react'
import { ArrowUp, Eraser, ImageIcon, Layers3, MessageSquareText, MousePointer2, Plus, RotateCcw, SquareDashed, Trash2, Upload } from 'lucide-react'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { ModelSelector } from '@/components/model-selector'
import { useModels } from '@/hooks/use-models'
import { cn } from '@/lib/utils'

type Point = { x: number; y: number }
type Annotation = { type: 'point' | 'bbox'; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number; prompt?: string }
type LayerProps = NodeProps<Node<CustomNodeData>>

const clamp = (value: number) => Math.round(Math.max(0, Math.min(999, value)))

function ImageLayerNode({ id, data, selected }: LayerProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const openMaterialPicker = useFlowStore((s) => s.openMaterialPicker)
  const { models } = useModels({ type: 'image' })
  const [mode, setMode] = useState<'layers' | 'edit'>('layers')
  const [tool, setTool] = useState<'point' | 'bbox'>('bbox')
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [dragStart, setDragStart] = useState<Point | null>(null)
  const [draftBox, setDraftBox] = useState<Annotation | null>(null)
  const [editingAnnotation, setEditingAnnotation] = useState<number | null>(null)
  const [generating, setGenerating] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const imageUrl = data.imageUrl as string | undefined
  const seedreamModels = models.filter((m) => m.id.includes('seedream-5-0'))
  const selectedModel = (data.meta as string) || seedreamModels.find((m) => m.id.includes('pro'))?.id || seedreamModels[0]?.id || ''
  const layers = data.layerItems ?? []

  const cancelActiveSelection = () => {
    setEditingAnnotation(null)
    setDragStart(null)
    setDraftBox(null)
  }

  useEffect(() => {
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as globalThis.Node | null
      if (target && !imageRef.current?.closest(`[data-node-id="${id}"]`)?.contains(target)) cancelActiveSelection()
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [])

  // 以实际图片元素为坐标基准，避免 object-contain 留白造成选区偏移。
  const toCoord = (e: React.PointerEvent): Point => {
    const rect = imageRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 }
    return { x: clamp(((e.clientX - rect.left) / rect.width) * 999), y: clamp(((e.clientY - rect.top) / rect.height) * 999) }
  }

  const finishBox = (end: Point) => {
    if (!dragStart) return
    const box: Annotation = { type: 'bbox', x1: Math.min(dragStart.x, end.x), y1: Math.min(dragStart.y, end.y), x2: Math.max(dragStart.x, end.x), y2: Math.max(dragStart.y, end.y) }
    setDragStart(null)
    setDraftBox(null)
    if ((box.x2 ?? 0) - (box.x1 ?? 0) > 10 && (box.y2 ?? 0) - (box.y1 ?? 0) > 10) {
      setAnnotations((items) => [...items, { ...box, prompt: '' }])
      setEditingAnnotation(annotations.length)
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!imageUrl || mode !== 'edit') return
    e.stopPropagation()
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const point = toCoord(e)
    if (tool === 'point') {
      setAnnotations((items) => [...items, { type: 'point', ...point, prompt: '' }])
      setEditingAnnotation(annotations.length)
    }
    else { setDragStart(point); setDraftBox({ type: 'bbox', x1: point.x, y1: point.y, x2: point.x, y2: point.y }) }
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStart || tool !== 'bbox') return
    e.stopPropagation()
    const end = toCoord(e)
    setDraftBox({ type: 'bbox', x1: Math.min(dragStart.x, end.x), y1: Math.min(dragStart.y, end.y), x2: Math.max(dragStart.x, end.x), y2: Math.max(dragStart.y, end.y) })
  }
  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragStart || tool !== 'bbox') return
    e.stopPropagation()
    finishBox(toCoord(e))
  }

  const removeAnnotation = (index: number) => {
    setAnnotations((items) => items.filter((_, i) => i !== index))
    setEditingAnnotation((current) => current === index ? null : current !== null && current > index ? current - 1 : current)
  }
  const handleFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => { setAnnotations([]); setEditingAnnotation(null); updateNodeData(id, { imageUrl: String(reader.result), status: 'ready', layerItems: undefined }) }
    reader.readAsDataURL(file)
  }
  const generate = async () => {
    if (!imageUrl || !selectedModel || generating || (mode === 'edit' && annotations.length === 0)) return
    setGenerating(true)
    updateNodeData(id, { status: 'generating', meta: selectedModel })
    try {
      const response = await fetch('/api/generate/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        model: selectedModel, prompt: '按各标注区域的编辑要求修改图片', referenceImage: imageUrl, referenceImages: [imageUrl], width: 2048, height: 2048,
        layerDecomposition: mode === 'layers', interactiveEdit: mode === 'edit', annotations,
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
      updateNodeData(id, { imageUrl: result.imageUrl, imageUrls: result.imageUrls, layerItems: result.layers, status: 'completed', meta: selectedModel })
      if (mode === 'edit') setAnnotations([])
    } catch (error) {
      updateNodeData(id, { status: 'failed', meta: error instanceof Error ? error.message : '生成失败' })
    } finally { setGenerating(false) }
  }

  const updateAnnotationPrompt = (index: number, value: string) => setAnnotations((items) => items.map((item, i) => i === index ? { ...item, prompt: value } : item))
  const renderAnnotation = (annotation: Annotation, index: number, draft = false) => {
    const label = draft ? '当前选区' : String(index + 1)
    const isEditing = !draft && editingAnnotation === index
    const left = annotation.type === 'point' ? annotation.x ?? 0 : annotation.x1 ?? 0
    const top = annotation.type === 'point' ? annotation.y ?? 0 : annotation.y1 ?? 0
    const width = annotation.type === 'bbox' ? ((annotation.x2 ?? 0) - (annotation.x1 ?? 0)) / 9.99 : 0
    const height = annotation.type === 'bbox' ? ((annotation.y2 ?? 0) - (annotation.y1 ?? 0)) / 9.99 : 0
    const promptLeft = Math.min(left, 700)
    const promptTop = Math.min(top + Math.max(height, 5) + 8, 760)
    return <Fragment key={`${label}-${index}`}><span data-region-editor={!draft ? true : undefined} onPointerDown={(e) => { if (!draft) { e.stopPropagation(); setEditingAnnotation(index) } }} className={cn('absolute z-10 border-2', annotation.type === 'point' && 'flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-lg', draft ? 'pointer-events-none border-white border-dashed bg-white/10' : 'cursor-pointer border-white border-dashed bg-white/5', annotation.type === 'point' && !draft && 'border-solid bg-indigo-500')} style={{ left: `${left / 9.99}%`, top: `${top / 9.99}%`, width: annotation.type === 'bbox' ? `${width}%` : undefined, height: annotation.type === 'bbox' ? `${height}%` : undefined }}>{annotation.type === 'point' && label}<span className="absolute left-full top-full ml-1.5 mt-1 whitespace-nowrap rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-600 shadow-sm">{label} 区域</span></span>{isEditing && <span data-region-editor className="absolute z-30 flex w-[310px] items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 text-slate-900 shadow-2xl" style={{ left: `${promptLeft / 9.99}%`, top: `${promptTop / 9.99}%` }} onPointerDown={(e) => e.stopPropagation()}><button className="flex size-8 shrink-0 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100" title="添加标记"><Plus className="size-5" /></button><input autoFocus value={annotation.prompt ?? ''} onChange={(e) => updateAnnotationPrompt(index, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setEditingAnnotation(null); e.stopPropagation() }} placeholder="添加标记…" className="min-w-0 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-slate-400" /><button onClick={() => setEditingAnnotation(null)} className="flex size-8 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100" title="完成标记"><MessageSquareText className="size-4" /></button><button onClick={() => { removeAnnotation(index); setEditingAnnotation(null) }} className="flex size-8 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100" title="清除选区"><Eraser className="size-4" /></button></span>}</Fragment>
  }

  return <NodeBase nodeId={id} nodeType="imageLayer" label={data.label} status={data.status} selected={selected} onDelete={() => deleteNode(id)} icon={<Layers3 className="size-3.5 text-indigo-400" />} width="w-[560px]" stopNodeDrag={Boolean(imageUrl && mode === 'edit')} onNodePointerDown={(e) => { if (editingAnnotation !== null && !(e.target as Element).closest('[data-region-editor]')) setEditingAnnotation(null) }}>
    <div className="mb-2 flex items-center justify-between gap-2"><div className="flex rounded-lg bg-muted/40 p-0.5"><button onClick={() => { cancelActiveSelection(); setMode('layers') }} className={cn('rounded-md px-3 py-1 text-[12px]', mode === 'layers' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>自动分层</button><button onClick={() => { cancelActiveSelection(); setMode('edit') }} className={cn('rounded-md px-3 py-1 text-[12px]', mode === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground')}>区域编辑</button></div><ModelSelector models={seedreamModels} selected={selectedModel} onSelect={(value) => updateNodeData(id, { meta: value })} /></div>
    {mode === 'edit' && imageUrl && <div className="mb-2 flex items-center gap-2 rounded-lg border border-indigo-400/20 bg-indigo-400/5 px-2.5 py-2 text-[11px] text-indigo-300"><span className="size-1.5 rounded-full bg-indigo-400" />{tool === 'bbox' ? '拖拽框选需要修改的区域' : '点击需要修改的位置'}<span className="ml-auto text-muted-foreground">{annotations.length} 个选区</span></div>}
    <div data-region-editor className={cn('relative flex min-h-[230px] items-center justify-center overflow-visible rounded-xl border border-border/50 bg-muted/20 p-2', mode === 'edit' && imageUrl && 'cursor-crosshair')}>
      {imageUrl ? <div className="nodrag nopan relative max-h-[300px] max-w-full select-none" style={{ touchAction: mode === 'edit' ? 'none' : 'auto' }} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={() => { setDragStart(null); setDraftBox(null) }}><img ref={imageRef} src={imageUrl} alt="待编辑图片" className="nodrag nopan block max-h-[300px] max-w-full select-none object-contain" draggable={false} />{mode === 'edit' && annotations.map((a, i) => renderAnnotation(a, i))}{mode === 'edit' && draftBox && renderAnnotation(draftBox, annotations.length, true)}</div> : <button onPointerDown={(e) => e.stopPropagation()} onClick={() => openMaterialPicker(id)} className="flex flex-col items-center gap-2 py-14 text-muted-foreground"><Upload className="size-5" /><span className="text-[12px]">从素材库选择图片</span></button>}
    </div>
    {imageUrl && <div className="nodrag nopan mt-2 flex items-center gap-1.5"><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} /><button onPointerDown={(e) => e.stopPropagation()} onClick={() => fileRef.current?.click()} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" title="替换图片"><ImageIcon className="size-3.5" /></button><button onPointerDown={(e) => e.stopPropagation()} onClick={() => openMaterialPicker(id)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted">素材库</button>{mode === 'edit' && <><span className="mx-1 h-4 w-px bg-border/50" /><button onPointerDown={(e) => e.stopPropagation()} onClick={() => setTool('point')} className={cn('nodrag nopan flex items-center gap-1 rounded-md px-2 py-1 text-[11px]', tool === 'point' ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:bg-muted')}><MousePointer2 className="size-3" />点选</button><button onPointerDown={(e) => e.stopPropagation()} onClick={() => setTool('bbox')} className={cn('nodrag nopan flex items-center gap-1 rounded-md px-2 py-1 text-[11px]', tool === 'bbox' ? 'bg-indigo-500/20 text-indigo-300' : 'text-muted-foreground hover:bg-muted')}><SquareDashed className="size-3" />框选</button><button onPointerDown={(e) => e.stopPropagation()} onClick={() => { setAnnotations((items) => items.slice(0, -1)); setEditingAnnotation(null) }} disabled={annotations.length === 0} className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" title="撤销上一个选区"><RotateCcw className="size-3.5" /></button><button onPointerDown={(e) => e.stopPropagation()} onClick={() => { setAnnotations([]); setEditingAnnotation(null) }} disabled={annotations.length === 0} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30" title="清空选区"><Trash2 className="size-3.5" /></button></>}</div>}
    {mode === 'edit' && <div className="mt-2 flex flex-wrap gap-1.5">{annotations.map((annotation, index) => <div key={index} data-region-editor className={cn('group flex items-center gap-1 rounded-md border bg-muted/30 text-[10px] text-muted-foreground transition-colors', editingAnnotation === index ? 'border-indigo-400/70 bg-indigo-400/10 text-foreground' : 'border-border/50 hover:border-indigo-400/50 hover:text-foreground')}><button data-region-editor onPointerDown={(e) => e.stopPropagation()} onClick={() => setEditingAnnotation(index)} className="flex items-center gap-1 px-2 py-1"><span className="flex size-3.5 items-center justify-center rounded-full bg-indigo-500 text-[9px] text-white">{index + 1}</span>{annotation.prompt?.trim() ? '查看提示词' : annotation.type === 'bbox' ? '区域待描述' : '点位待描述'}</button><button data-region-editor onPointerDown={(e) => e.stopPropagation()} onClick={() => removeAnnotation(index)} className="flex size-5 items-center justify-center rounded-r-md text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive" title={`删除第 ${index + 1} 个标注`}><Trash2 className="size-2.5" /></button></div>)}</div>}
    {layers.length > 0 && <div className="mt-2 border-t border-border/40 pt-2"><div className="mb-1 text-[11px] text-muted-foreground">已拆分图层 {layers.length} 个</div><div className="grid grid-cols-4 gap-1.5">{layers.map((layer, i) => <div key={i} className="overflow-hidden rounded-md border border-border/40 bg-muted/20" title={layer.description || layer.name}><img src={layer.url} alt={layer.name || `图层 ${i + 1}`} className="aspect-square w-full object-contain" /><div className="truncate px-1 py-1 text-[10px] text-muted-foreground">{layer.name || `图层 ${i + 1}`}</div></div>)}</div></div>}
    <div className="mt-2 flex items-center justify-end border-t border-border/40 pt-2"><button onPointerDown={(e) => e.stopPropagation()} onClick={generate} disabled={!imageUrl || !selectedModel || generating || (mode === 'edit' && (annotations.length === 0 || annotations.some((annotation) => !annotation.prompt?.trim())))} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] text-primary-foreground disabled:opacity-40"><ArrowUp className="size-3.5" />{generating ? '处理中…' : mode === 'layers' ? '开始分层' : '生成编辑图'}</button></div>
  </NodeBase>
}

export default memo(ImageLayerNode)
