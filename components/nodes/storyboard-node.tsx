'use client'

import { memo, useState, useCallback, useRef, useLayoutEffect, useEffect, useMemo, type ReactNode } from 'react'
import { NodeProps, Node } from '@xyflow/react'
import { ChevronDown, Clapperboard, Film, Monitor, Plus, Ratio, Upload, X, ZoomIn } from 'lucide-react'
import { CustomNodeData, useFlowStore } from '@/lib/store'
import { NodeBase } from './node-base'
import { CopyButton } from '@/components/copy-button'
import { buildStoryboardVideoGroups } from '@/lib/storyboard-video-groups'

const SHOT_TYPES = ['特写', '近景', '中景', '中全景', '全景', '远景', '大远景']
const CAMERA_MOVES = ['固定', '推', '拉', '摇', '移', '跟', '升', '降', '环绕', '甩', '晃', '航拍']
const VIDEO_RATIOS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16', 'auto']
const VIDEO_RESOLUTIONS = ['480p', '720p', '1080p']

interface StoryboardRow {
  sceneIndex: number
  description: string
  sceneImages?: string[]
  characterImages?: string[]
  propImages?: string[]
  // legacy single-image fields (migrated on parse)
  sceneImage?: string
  characterImage?: string
  characters?: string[]
  locationName?: string
  propNames?: string[]
  shotType?: string
  blocking?: string
  action?: string
  expression?: string
  cameraAngle?: string
  composition?: string
  camera: string
  dialogue: string
  duration?: string
  durationReason?: string
  negativePrompt?: string
  aspectRatio?: string
  outputMode?: string
  // node references from AI extraction
  sceneNodeId?: string
  characterNodeIds?: string[]
  propNodeIds?: string[]
}

function migrateRow(row: StoryboardRow): StoryboardRow {
  const sceneImages = row.sceneImages ?? (row.sceneImage ? [row.sceneImage] : [])
  const characterImages = row.characterImages ?? (row.characterImage ? [row.characterImage] : [])
  const propImages = row.propImages ?? []
  const { sceneImage: _s, characterImage: _c, ...rest } = row
  return { ...rest, sceneImages, characterImages, propImages }
}

function parseRows(content?: string): StoryboardRow[] {
  if (!content) return [emptyRow(1)]
  try {
    const arr = JSON.parse(content)
    return Array.isArray(arr) && arr.length > 0 ? arr.map(migrateRow) : [emptyRow(1)]
  } catch {
    return [emptyRow(1)]
  }
}

function emptyRow(idx: number): StoryboardRow {
  return {
    sceneIndex: idx,
    description: '',
    blocking: '',
    action: '',
    expression: '',
    cameraAngle: '',
    composition: '',
    camera: '',
    dialogue: '',
    shotType: '',
    sceneImages: [],
    characterImages: [],
    propImages: [],
  }
}

function rowAssetSearchText(row: StoryboardRow) {
  return [
    row.description,
    row.blocking,
    row.action,
    row.expression,
    row.cameraAngle,
    row.composition,
    row.dialogue,
    row.locationName,
    ...(row.characters ?? []),
    ...(row.propNames ?? []),
  ].filter(Boolean).join('\n')
}

function assetNameFromLabel(label: string, prefix: string) {
  return label.startsWith(prefix) ? label.slice(prefix.length) : ''
}

function storyboardRowToText(row: StoryboardRow, index: number) {
  return [
    `镜号：${index + 1}`,
    row.duration ? `时长：${row.duration}` : '',
    row.durationReason ? `时长依据：${row.durationReason}` : '',
    row.locationName ? `场景：${row.locationName}` : '',
    row.characters?.length ? `角色：${row.characters.join('、')}` : '',
    row.propNames?.length ? `道具：${row.propNames.join('、')}` : '',
    row.description ? `画面内容：${row.description}` : '',
    row.blocking ? `站位：${row.blocking}` : '',
    row.action ? `动作：${row.action}` : '',
    row.expression ? `表情：${row.expression}` : '',
    row.cameraAngle ? `机位：${row.cameraAngle}` : '',
    row.composition ? `构图：${row.composition}` : '',
    row.shotType ? `景别：${row.shotType}` : '',
    row.camera ? `运镜：${row.camera}` : '',
    row.dialogue ? `旁白/台词：${row.dialogue}` : '',
  ].filter(Boolean).join('\n')
}

function countVideoGroups(rows: StoryboardRow[], maxDuration: 15 | 30) {
  return buildStoryboardVideoGroups(rows as unknown as Array<Record<string, unknown>>, maxDuration).length
}

function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <button onClick={onClose} className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80">
        <X className="size-5" />
      </button>
      <img src={src} alt="" className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}

function ImageGrid({ images, onAdd, onRemove, onPreview }: {
  images: string[]
  onAdd: () => void
  onRemove: (idx: number) => void
  onPreview: (src: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {images.map((src, j) => (
        <div key={j} className="group/img relative size-9 overflow-hidden rounded-md">
          <img src={src} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/50 opacity-0 transition-opacity group-hover/img:opacity-100">
            <button onClick={() => onPreview(src)} className="rounded p-0.5 hover:bg-white/20"><ZoomIn className="size-3 text-white" /></button>
            <button onClick={() => onRemove(j)} className="rounded p-0.5 hover:bg-white/20"><X className="size-3 text-white" /></button>
          </div>
        </div>
      ))}
      <button
        onClick={onAdd}
        className="flex size-9 items-center justify-center rounded-md border border-dashed border-border/40 text-muted-foreground/30 hover:border-border/60 hover:text-muted-foreground/50"
      >
        <Upload className="size-3" />
      </button>
    </div>
  )
}

function DropdownCell({ value, options, placeholder, onChange }: {
  value: string
  options: string[]
  placeholder: string
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} className="w-full rounded px-1 py-1 text-center text-[11px] text-foreground hover:bg-muted/30">
        {value || <span className="text-muted-foreground/25">{placeholder}</span>}
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-lg border border-border/50 bg-popover p-1 shadow-xl">
          {options.map((opt) => (
            <button key={opt} onClick={() => { onChange(opt); setOpen(false) }}
              className={`block w-full whitespace-nowrap rounded px-3 py-1 text-left text-[11px] hover:bg-muted/40 ${opt === value ? 'text-primary font-medium' : 'text-foreground'}`}>
              {opt}
            </button>
          ))}
          {value && (
            <button onClick={() => { onChange(''); setOpen(false) }}
              className="block w-full whitespace-nowrap rounded px-3 py-1 text-left text-[11px] text-destructive/60 hover:bg-destructive/10">
              清除
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function VideoSettingChip({
  value,
  options,
  label,
  icon,
  onChange,
}: {
  value: string
  options: string[]
  label: string
  icon: ReactNode
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-w-[86px] items-center justify-center gap-1.5 rounded-full border border-border/45 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={label}
      >
        <span className="text-primary/75">{icon}</span>
        <span>{value || label}</span>
        <ChevronDown className="size-3 text-muted-foreground/70" />
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-1 min-w-full -translate-x-1/2 rounded-lg border border-border/50 bg-popover p-1 shadow-xl">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(opt)
                setOpen(false)
              }}
              className={`block w-full whitespace-nowrap rounded-md px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-muted/40 ${
                opt === value ? 'bg-primary/10 font-medium text-primary' : 'text-foreground'
              }`}
              role="option"
              aria-selected={opt === value}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TextCell({ value, placeholder, onChange, rows = 1 }: {
  value: string
  placeholder: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div className="group/textcell relative">
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className="w-full resize-none rounded border-0 bg-transparent px-1 py-0.5 pr-6 text-[11px] leading-relaxed text-foreground placeholder:text-muted-foreground/25 focus:bg-muted/20 focus:outline-none"
      />
      <CopyButton
        text={value}
        iconOnly
        title={`复制${placeholder}`}
        className="absolute right-0.5 top-0.5 size-5 opacity-0 group-hover/textcell:opacity-100"
      />
    </div>
  )
}

/** Chip showing a referenced image node's label + thumbnail (once generated) */
function NodeChip({ nodeId, variant = 'neutral' }: { nodeId: string; variant?: 'scene' | 'char' | 'prop' | 'neutral' }) {
  const node = useFlowStore((s) => s.nodes.find((n) => n.id === nodeId))
  if (!node) return null

  const dotCls = variant === 'scene' ? 'bg-emerald-500' : variant === 'char' ? 'bg-blue-500' : variant === 'prop' ? 'bg-amber-500' : 'bg-muted-foreground/20'
  const borderCls = variant === 'scene' ? 'border-emerald-500/40' : variant === 'char' ? 'border-blue-500/40' : variant === 'prop' ? 'border-amber-500/40' : 'border-border/30'

  return (
    <div className={`flex items-center gap-1 rounded-md border ${borderCls} bg-muted/30 px-1.5 py-0.5 min-w-0`}>
      {node.data.imageUrl ? (
        <img src={node.data.imageUrl as string} className="size-6 shrink-0 rounded object-cover" alt="" />
      ) : (
        <div className="size-6 shrink-0 rounded bg-muted/60 flex items-center justify-center">
          <div className={`size-2 rounded-full ${dotCls}`} />
        </div>
      )}
      <span className="truncate text-[9px] text-foreground/60 max-w-[56px]">{node.data.label as string}</span>
    </div>
  )
}

/** Rich description editor: view mode highlights [Xs-Xs] and @refs; edit mode has @ autocomplete */
function DescriptionCell({ row, onChange }: { row: StoryboardRow; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.description)
  const [suggestions, setSuggestions] = useState<{ key: string; label: string; color: string; imageUrl?: string }[]>([])
  const [showSug, setShowSug] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const allNodes = useFlowStore((s) => s.nodes)
  const openMaterialPicker = useFlowStore((s) => s.openMaterialPicker)

  // Keep draft in sync when row.description changes externally
  useEffect(() => { if (!editing) setDraft(row.description) }, [row.description, editing])

  // Mentionable nodes for this row — includes imageUrl for thumbnail chips
  const mentionables = useMemo(() => {
    const list: { key: string; name: string; color: string; chipCls: string; imageUrl?: string }[] = []
    const addNode = (id: string, color: string, chipCls: string) => {
      const n = allNodes.find((x) => x.id === id)
      if (!n) return
      const raw = n.data.label as string
      const name = raw.includes('：') ? raw.split('：')[1] : raw
      list.push({ key: id, name, color, chipCls, imageUrl: n.data.imageUrl as string | undefined })
    }
    if (row.sceneNodeId) addNode(row.sceneNodeId, 'text-emerald-400', 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25')
    for (const id of row.characterNodeIds ?? []) addNode(id, 'text-blue-400', 'bg-blue-500/15 border-blue-500/30 text-blue-400 hover:bg-blue-500/25')
    for (const id of row.propNodeIds ?? []) addNode(id, 'text-amber-400', 'bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25')
    return list
  }, [allNodes, row.sceneNodeId, row.characterNodeIds, row.propNodeIds])

  const detectAt = (ta: HTMLTextAreaElement) => {
    const pos = ta.selectionStart ?? 0
    const before = ta.value.slice(0, pos)
    const m = before.match(/@(\S*)$/)
    if (m) {
      const q = m[1].toLowerCase()
      const filtered = mentionables.filter((x) => x.name.toLowerCase().includes(q))
      setSuggestions(filtered.map((x) => ({ key: x.key, label: x.name, color: x.color, imageUrl: x.imageUrl })))
      setShowSug(filtered.length > 0)
    } else {
      setShowSug(false)
    }
  }

  const insertMention = (name: string) => {
    const ta = taRef.current
    if (!ta) return
    const pos = ta.selectionStart ?? 0
    const before = draft.slice(0, pos)
    const after = draft.slice(pos)
    const m = before.match(/@(\S*)$/)
    const prefix = m ? before.slice(0, before.length - m[0].length) : before
    const next = `${prefix}@${name} ${after.trimStart()}`
    setDraft(next)
    onChange(next)
    setShowSug(false)
    requestAnimationFrame(() => {
      ta.focus()
      const newPos = prefix.length + name.length + 2
      ta.setSelectionRange(newPos, newPos)
    })
  }

  // Render text with highlighted [Xs-Xs] and @xxx chips (with thumbnail + click-to-replace)
  const renderHighlighted = (text: string) => {
    const parts = text.split(/((?:\[\d+s-\d+s\]|\[\d+s\]))|(@\S+)/g).filter(Boolean)
    return parts.map((part, idx) => {
      if (/^\[/.test(part)) {
        return <span key={idx} className="rounded bg-primary/10 px-0.5 font-mono text-[10px] text-primary/70">{part}</span>
      }
      if (part.startsWith('@')) {
        const name = part.slice(1).replace(/[.,。，！？]+$/, '')
        const m = mentionables.find((x) => x.name === name)
        if (m) {
          return (
            <button
              key={idx}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); openMaterialPicker(m.key) }}
              title={`点击替换 @${name} 的图片`}
              className={`inline-flex items-center gap-0.5 rounded border px-0.5 py-px text-[11px] font-medium leading-5 transition-colors cursor-pointer ${m.chipCls}`}
            >
              {m.imageUrl && <img src={m.imageUrl} alt="" className="size-3 shrink-0 rounded-[2px] object-cover" />}
              {part}
            </button>
          )
        }
        return <span key={idx} className="font-medium text-primary/70">{part}</span>
      }
      return <span key={idx}>{part}</span>
    })
  }

  if (editing) {
    return (
      <div className="relative">
        {row.duration && (
          <div className="mb-1 flex items-center gap-1.5">
            <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary/60">[0s-{row.duration}]</span>
            <span className="text-[10px] text-muted-foreground/40">输入 @ 引用本镜素材</span>
            <CopyButton text={draft} iconOnly title="复制画面内容" className="ml-auto size-5" />
          </div>
        )}
        <textarea
          ref={taRef}
          value={draft}
          autoFocus
          rows={3}
          onChange={(e) => { setDraft(e.target.value); onChange(e.target.value) }}
          onKeyUp={() => taRef.current && detectAt(taRef.current)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Escape') { setEditing(false); setShowSug(false) }
          }}
          onBlur={() => setTimeout(() => { setEditing(false); setShowSug(false) }, 160)}
          placeholder={`[0s-${row.duration ?? 'Xs'}] @场景名 画面描述 @角色名 动作...`}
          className="w-full resize-none rounded border border-primary/20 bg-background/60 px-2 py-1.5 text-[12px] leading-relaxed text-foreground placeholder:text-muted-foreground/25 focus:border-primary/50 focus:outline-none"
        />
        {showSug && (
          <div className="absolute left-0 top-full z-50 mt-0.5 min-w-[140px] rounded-lg border border-border/50 bg-popover p-1 shadow-xl">
            {suggestions.map((s) => (
              <button
                key={s.key}
                onMouseDown={(e) => { e.preventDefault(); insertMention(s.label) }}
                className={`flex w-full items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-left text-[11px] font-medium hover:bg-muted/40 ${s.color}`}
              >
                {s.imageUrl
                  ? <img src={s.imageUrl} alt="" className="size-4 shrink-0 rounded-[3px] object-cover" />
                  : <span className="size-4 shrink-0 rounded-[3px] bg-current opacity-20" />}
                @{s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="group/desc relative">
      <div
        role="button"
        onClick={() => { setDraft(row.description); setEditing(true) }}
        className="min-h-[44px] w-full cursor-text rounded px-1 py-0.5 pr-7 hover:bg-muted/20"
      >
        {row.description ? (
          <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">
            {renderHighlighted(row.description)}
          </p>
        ) : (
          <span className="text-[12px] text-muted-foreground/25">[0s-Xs] @场景名 画面描述...</span>
        )}
      </div>
      <CopyButton
        text={row.description}
        iconOnly
        title="复制画面内容"
        className="absolute right-0.5 top-0.5 size-5 opacity-0 group-hover/desc:opacity-100"
      />
    </div>
  )
}

type StoryboardNodeProps = NodeProps<Node<CustomNodeData>>

function StoryboardNode({ id, data, selected }: StoryboardNodeProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const deleteNode = useFlowStore((s) => s.deleteNode)
  const openMaterialPicker = useFlowStore((s) => s.openMaterialPicker)
  const createStoryboardVideoGroups = useFlowStore((s) => s.createStoryboardVideoGroups)
  const allEdges = useFlowStore((s) => s.edges)
  const allNodes = useFlowStore((s) => s.nodes)

  const [rows, setRows] = useState<StoryboardRow[]>(() => parseRows(data.content))
  const lastPersistedRef = useRef(data.content)
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [lastGroupResult, setLastGroupResult] = useState('')
  const [videoRatio, setVideoRatio] = useState('9:16')
  const [videoResolution, setVideoResolution] = useState('720p')

  useEffect(() => {
    if (data.content !== lastPersistedRef.current) {
      lastPersistedRef.current = data.content
      setRows(parseRows(data.content))
    }
  }, [data.content])

  const wrapperRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const [portTops, setPortTops] = useState<Record<string, string>>({})
  const [leftHandles, setLeftHandles] = useState<Array<{ id: string; top: string; color: string }>>([])

  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapperRef.current
      if (!wrap || wrap.getBoundingClientRect().height === 0) {
        requestAnimationFrame(measure)
        return
      }
      const wrapBox = wrap.getBoundingClientRect()
      const nextPortTops: Record<string, string> = {}
      const nextLeft: Array<{ id: string; top: string; color: string }> = []

      rowRefs.current.forEach((el, i) => {
        if (!el) return
        const box = el.getBoundingClientRect()
        const rowTop = box.top - wrapBox.top
        const rowH = box.height
        const centerPx = rowTop + rowH / 2
        nextPortTops[`row-${i}`] = `${(centerPx / wrapBox.height) * 100}%`

        // Fixed 3 handles per row at 25% / 50% / 75% of row height — never overflow into adjacent rows
        const pct = (px: number) => `${(px / wrapBox.height) * 100}%`
        nextLeft.push({ id: `scene-in-${i}`,   top: pct(rowTop + rowH * 0.25), color: '!bg-emerald-500 !border-background !border-[2.5px]' })
        nextLeft.push({ id: `char-in-${i}-0`,  top: pct(rowTop + rowH * 0.5),  color: '!bg-blue-500 !border-background !border-[2.5px]' })
        nextLeft.push({ id: `prop-in-${i}-0`,  top: pct(rowTop + rowH * 0.75), color: '!bg-amber-500 !border-background !border-[2.5px]' })
      })

      setPortTops((prev) => {
        const changed = Object.keys(nextPortTops).some((k) => nextPortTops[k] !== prev[k])
        return changed ? nextPortTops : prev
      })
      setLeftHandles(nextLeft)
    }
    measure()
    const rafId = requestAnimationFrame(measure)
    const wrap = wrapperRef.current
    if (!wrap) return () => cancelAnimationFrame(rafId)
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    return () => { cancelAnimationFrame(rafId); ro.disconnect() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length])

  const persist = useCallback((next: StoryboardRow[]) => {
    setRows(next)
    const json = JSON.stringify(next)
    lastPersistedRef.current = json
    const hasContent = next.some((r) => r.description.trim())
    updateNodeData(id, { content: json, status: hasContent ? 'ready' : 'idle' })
  }, [id, updateNodeData])

  const updateRow = (idx: number, patch: Partial<StoryboardRow>) => {
    persist(rows.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  const addRow = () => persist([...rows, emptyRow(rows.length + 1)])

  const removeRow = (idx: number) => {
    if (rows.length <= 1) return
    persist(rows.filter((_, i) => i !== idx).map((r, i) => ({ ...r, sceneIndex: i + 1 })))
  }

  const removeSceneImage = (rowIdx: number, imgIdx: number) => {
    const imgs = [...(rows[rowIdx].sceneImages ?? [])]
    imgs.splice(imgIdx, 1)
    updateRow(rowIdx, { sceneImages: imgs })
  }

  const removeCharImage = (rowIdx: number, imgIdx: number) => {
    const imgs = [...(rows[rowIdx].characterImages ?? [])]
    imgs.splice(imgIdx, 1)
    updateRow(rowIdx, { characterImages: imgs })
  }

  const removePropImage = (rowIdx: number, imgIdx: number) => {
    const imgs = [...(rows[rowIdx].propImages ?? [])]
    imgs.splice(imgIdx, 1)
    updateRow(rowIdx, { propImages: imgs })
  }

  // ── Right-side output ports: one handle per storyboard row ──
  const outputPorts = useMemo(() => {
    return rows.map((_, i) => ({
      id: `row-${i}`,
      top: portTops[`row-${i}`] ?? `${((i + 0.5) / rows.length) * 100}%`,
    }))
  }, [portTops, rows])

  // Helper: find node IDs connected to a given handle
  const connectedTo = (handle: string) =>
    allEdges.filter((e) => e.target === id && e.targetHandle === handle).map((e) => e.source)

  const uniqueIds = (ids: Array<string | undefined>) => Array.from(new Set(ids.filter((x): x is string => !!x)))

  const inferAssetNodeIds = (prefix: '场景：' | '角色：' | '道具：', text: string) =>
    allNodes
      .filter((n) => n.data.type === 'image' && n.data.mode === 'result')
      .filter((n) => {
        const label = n.data.label as string
        const name = assetNameFromLabel(label, prefix)
        return name && text.includes(name)
      })
      .map((n) => n.id)

  return (
    <NodeBase
      ref={wrapperRef}
      nodeId={id}
      nodeType="storyboard"
      label={data.label}
      status={data.status}
      selected={selected}
      onDelete={() => deleteNode(id)}
      icon={<Clapperboard className="size-3.5" />}
      hasOutput={false}
      outputPorts={outputPorts}
      leftHandles={leftHandles}
      width="w-[1320px]"
      noPadding
    >
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}

      <div className="nodrag nopan overflow-x-auto" onPointerDown={(e) => e.stopPropagation()}>
        <div className="sticky left-0 z-10 mb-2 flex min-w-[980px] items-center justify-between gap-2 rounded-xl border border-border/30 bg-background/95 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Film className="size-3.5 text-primary/70" />
            <span>多镜头视频段</span>
            {lastGroupResult && <span className="text-emerald-500">{lastGroupResult}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <VideoSettingChip
              value={videoRatio}
              options={VIDEO_RATIOS}
              label="比例"
              icon={<Ratio className="size-3" />}
              onChange={setVideoRatio}
            />
            <VideoSettingChip
              value={videoResolution}
              options={VIDEO_RESOLUTIONS}
              label="分辨率"
              icon={<Monitor className="size-3" />}
              onChange={setVideoResolution}
            />
            <button
              onClick={() => {
                const count = createStoryboardVideoGroups(id, {
                  maxDuration: 15,
                  modelLabel: 'Seedance 2.0',
                  modelId: 'doubao-seedance-2-0-260128',
                  ratio: videoRatio,
                  resolution: videoResolution,
                })
                setLastGroupResult(count > 0 ? `已创建 ${count} 个视频段` : '暂无可分组镜头')
              }}
              className="flex items-center gap-1 rounded-full border border-sky-500/30 px-2.5 py-1 text-[11px] font-medium text-sky-400 transition-colors hover:bg-sky-500/10"
              title={`按15秒上限自动分组，预计${countVideoGroups(rows, 15)}段`}
            >
              <Film className="size-3" />
              Seedance 2.0 · 15s
            </button>
            <button
              onClick={() => {
                const count = createStoryboardVideoGroups(id, {
                  maxDuration: 30,
                  modelLabel: 'Seedance 2.5',
                  modelId: 'doubao-seedance-2-5-260628',
                  ratio: videoRatio,
                  resolution: videoResolution,
                })
                setLastGroupResult(count > 0 ? `已创建 ${count} 个视频段` : '暂无可分组镜头')
              }}
              className="flex items-center gap-1 rounded-full border border-emerald-500/30 px-2.5 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10"
              title={`按30秒上限自动分组，预计${countVideoGroups(rows, 30)}段`}
            >
              <Film className="size-3" />
              Seedance 2.5 · 30s
            </button>
          </div>
        </div>
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="bg-muted/50 text-muted-foreground">
              <th className="w-[36px] border border-border px-2 py-2 text-center font-medium">镜号</th>
              <th className="min-w-[160px] border border-border px-2 py-2 text-left font-medium">画面内容</th>
              <th className="w-[96px] border border-border px-1 py-2 text-center font-medium">场景图</th>
              <th className="w-[96px] border border-border px-1 py-2 text-center font-medium">角色</th>
              <th className="w-[96px] border border-border px-1 py-2 text-center font-medium">道具</th>
              <th className="w-[112px] border border-border px-2 py-2 text-left font-medium">站位</th>
              <th className="w-[132px] border border-border px-2 py-2 text-left font-medium">动作/表情</th>
              <th className="w-[132px] border border-border px-2 py-2 text-left font-medium">机位/构图</th>
              <th className="w-[56px] border border-border px-1 py-2 text-center font-medium">景别</th>
              <th className="w-[56px] border border-border px-1 py-2 text-center font-medium">运镜</th>
              <th className="min-w-[100px] border border-border px-2 py-2 text-left font-medium">旁白</th>
              <th className="w-[28px] border-b border-border" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const rowText = rowAssetSearchText(row)
              // Scene: only live edges (removing an edge immediately hides the chip)
              const sceneNodeIds = uniqueIds([...connectedTo(`scene-in-${i}`), row.sceneNodeId, ...inferAssetNodeIds('场景：', rowText)])

              // Characters: live edges only; also scan extra slots beyond stored count
              const maxCharSlots = Math.max((row.characters ?? []).length, (row.characterNodeIds ?? []).length, 3)
              const charNodeIds = uniqueIds([
                ...Array.from({ length: maxCharSlots }, (_, j) => connectedTo(`char-in-${i}-${j}`)).flat(),
                ...(row.characterNodeIds ?? []),
                ...inferAssetNodeIds('角色：', rowText),
              ])

              // Props: live edges only; scan extra slots
              const maxPropSlots = Math.max((row.propNodeIds ?? []).length, 3)
              const propNids = uniqueIds([
                ...Array.from({ length: maxPropSlots }, (_, j) => connectedTo(`prop-in-${i}-${j}`)).flat(),
                ...(row.propNodeIds ?? []),
                ...inferAssetNodeIds('道具：', rowText),
              ])

              return (
                <tr
                  key={i}
                  ref={(el) => { rowRefs.current[i] = el }}
                  className="group/row transition-colors hover:bg-muted/10"
                >
                  {/* 镜号 */}
                  <td className="border border-border px-2 py-1.5 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-bold text-primary/60">{i + 1}</span>
                      <CopyButton text={storyboardRowToText(row, i)} iconOnly title="复制整条分镜" className="size-5" />
                    </div>
                  </td>

                  {/* 画面内容 */}
                  <td className="border border-border px-2 py-1">
                    <DescriptionCell
                      row={row}
                      onChange={(v) => updateRow(i, { description: v })}
                    />
                  </td>

                  {/* 场景图 */}
                  <td className="border border-border px-1 py-1.5">
                    <div className="flex flex-col items-center gap-1">
                      {/* Node chips (auto-linked or manually linked via handle) */}
                      {sceneNodeIds.length > 0 ? (
                        <div className="flex flex-col gap-0.5 w-full">
                          {sceneNodeIds.map((nid) => <NodeChip key={nid} nodeId={nid} variant="scene" />)}
                        </div>
                      ) : null}
                      {/* Manually uploaded images */}
                      {(row.sceneImages ?? []).length > 0 && (
                        <ImageGrid
                          images={row.sceneImages ?? []}
                          onAdd={() => openMaterialPicker(`${id}:scene:${i}`)}
                          onRemove={(j) => removeSceneImage(i, j)}
                          onPreview={setLightboxSrc}
                        />
                      )}
                      {sceneNodeIds.length === 0 && (row.sceneImages ?? []).length === 0 && (
                        <button
                          onClick={() => openMaterialPicker(`${id}:scene:${i}`)}
                          className="flex size-9 items-center justify-center rounded-md border border-dashed border-border/40 text-muted-foreground/30 hover:border-border/60 hover:text-muted-foreground/50"
                        >
                          <Upload className="size-3" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 角色 */}
                  <td className="border border-border px-1 py-1.5">
                    <div className="flex flex-col items-center gap-1">
                      {/* Node chips (auto-linked or manually linked via handle) */}
                      {charNodeIds.length > 0 ? (
                        <div className="flex flex-col gap-0.5 w-full">
                          {charNodeIds.map((nid) => <NodeChip key={nid} nodeId={nid} variant="char" />)}
                        </div>
                      ) : row.characters && row.characters.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {row.characters.map((name) => (
                            <span key={name} className="rounded bg-blue-500/10 px-1 py-0.5 text-[9px] font-medium text-blue-400">
                              @{name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {/* Manually uploaded images */}
                      {(row.characterImages ?? []).length > 0 && (
                        <ImageGrid
                          images={row.characterImages ?? []}
                          onAdd={() => openMaterialPicker(`${id}:char:${i}`)}
                          onRemove={(j) => removeCharImage(i, j)}
                          onPreview={setLightboxSrc}
                        />
                      )}
                      {charNodeIds.length === 0 && (row.characterImages ?? []).length === 0 && !row.characters?.length && (
                        <button
                          onClick={() => openMaterialPicker(`${id}:char:${i}`)}
                          className="flex size-9 items-center justify-center rounded-md border border-dashed border-border/40 text-muted-foreground/30 hover:border-border/60 hover:text-muted-foreground/50"
                        >
                          <Upload className="size-3" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 道具 */}
                  <td className="border border-border px-1 py-1.5">
                    <div className="flex flex-col items-center gap-1">
                      {propNids.length > 0 ? (
                        <div className="flex flex-col gap-0.5 w-full">
                          {propNids.map((nid) => <NodeChip key={nid} nodeId={nid} variant="prop" />)}
                        </div>
                      ) : null}
                      {(row.propImages ?? []).length > 0 && (
                        <ImageGrid
                          images={row.propImages ?? []}
                          onAdd={() => openMaterialPicker(`${id}:prop:${i}`)}
                          onRemove={(j) => removePropImage(i, j)}
                          onPreview={setLightboxSrc}
                        />
                      )}
                      {propNids.length === 0 && (row.propImages ?? []).length === 0 && (
                        <button
                          onClick={() => openMaterialPicker(`${id}:prop:${i}`)}
                          className="flex size-9 items-center justify-center rounded-md border border-dashed border-border/40 text-muted-foreground/30 hover:border-border/60 hover:text-muted-foreground/50"
                        >
                          <Upload className="size-3" />
                        </button>
                      )}
                    </div>
                  </td>

                  {/* 站位 */}
                  <td className="border border-border px-2 py-1">
                    <TextCell
                      value={row.blocking ?? ''}
                      placeholder="角色站位/相对距离"
                      onChange={(v) => updateRow(i, { blocking: v })}
                      rows={2}
                    />
                  </td>

                  {/* 动作/表情 */}
                  <td className="border border-border px-2 py-1">
                    <div className="space-y-1">
                      <TextCell
                        value={row.action ?? ''}
                        placeholder="动作"
                        onChange={(v) => updateRow(i, { action: v })}
                      />
                      <TextCell
                        value={row.expression ?? ''}
                        placeholder="表情/情绪"
                        onChange={(v) => updateRow(i, { expression: v })}
                      />
                    </div>
                  </td>

                  {/* 机位/构图 */}
                  <td className="border border-border px-2 py-1">
                    <div className="space-y-1">
                      <TextCell
                        value={row.cameraAngle ?? ''}
                        placeholder="机位/角度"
                        onChange={(v) => updateRow(i, { cameraAngle: v })}
                      />
                      <TextCell
                        value={row.composition ?? ''}
                        placeholder="构图/主体位置"
                        onChange={(v) => updateRow(i, { composition: v })}
                      />
                    </div>
                  </td>

                  {/* 景别 */}
                  <td className="border border-border px-1 py-1">
                    <DropdownCell value={row.shotType || ''} options={SHOT_TYPES} placeholder="景别" onChange={(v) => updateRow(i, { shotType: v })} />
                  </td>

                  {/* 运镜 */}
                  <td className="border border-border px-1 py-1">
                    <DropdownCell value={row.camera} options={CAMERA_MOVES} placeholder="运镜" onChange={(v) => updateRow(i, { camera: v })} />
                  </td>

                  {/* 旁白 */}
                  <td className="border border-border px-2 py-1">
                    <div className="group/dialogue relative">
                      <input
                        value={row.dialogue}
                        onChange={(e) => updateRow(i, { dialogue: e.target.value })}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder="台词/旁白"
                        className="w-full rounded border-0 bg-transparent px-1 py-0.5 pr-6 text-[11px] text-foreground placeholder:text-muted-foreground/25 focus:bg-muted/20 focus:outline-none"
                      />
                      <CopyButton text={row.dialogue} iconOnly title="复制台词/旁白" className="absolute right-0 top-0 size-5 opacity-0 group-hover/dialogue:opacity-100" />
                    </div>
                  </td>

                  {/* 删除行 */}
                  <td className="border-b border-border px-0.5 py-1 text-center">
                    <button
                      onClick={() => removeRow(i)}
                      className="rounded p-0.5 text-muted-foreground/0 transition-colors group-hover/row:text-muted-foreground/40 hover:!text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <button
          onClick={addRow}
          className="flex w-full items-center justify-center gap-1 border-t border-dashed border-border/30 py-2 text-[11px] text-muted-foreground/40 hover:bg-muted/20 hover:text-muted-foreground/60"
        >
          <Plus className="size-3" />
          添加分镜
        </button>
      </div>
    </NodeBase>
  )
}

export default memo(StoryboardNode)
