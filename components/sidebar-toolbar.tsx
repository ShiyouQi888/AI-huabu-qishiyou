'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import {
  Plus,
  AudioLines,
  LayoutTemplate,
  Clock,
  Settings,
  X,
  AlignLeft,
  ImageIcon,
  Video,
  FileCode2,
  Table2,
  Upload,
  Image as ImageLibrary,
  Search,
  PenTool,
  Camera,
  ScrollText,
  Layers3,
} from 'lucide-react'
import { NodeType, CustomNodeData, useFlowStore } from '@/lib/store'
import { useReactFlow } from '@xyflow/react'
import { CanvasMenuPanelType } from './canvas-menu-panel'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/lib/project-store'

interface SidebarToolbarProps {
  activePanel: CanvasMenuPanelType | null
  onOpenPanel: (panel: CanvasMenuPanelType) => void
  onOpenMaterials: () => void
}

export interface NodeOption {
  type: NodeType
  label: string
  desc: string
  icon: typeof AlignLeft
  color: string
  bgClass: string
  beta?: boolean
}

export const nodeOptions: NodeOption[] = [
  { type: 'text',            label: 'AI 文本',    desc: '生成文案 / 对话 / 文本',   icon: AlignLeft,         color: 'text-amber-400',   bgClass: 'bg-amber-500/10' },
  { type: 'image',           label: 'AI 生图',    desc: '文生图 / 图生图',          icon: ImageIcon,         color: 'text-blue-400',    bgClass: 'bg-blue-500/10' },
  { type: 'imageLayer',      label: '图片分层',   desc: '图层拆分 / 区域编辑',       icon: Layers3,            color: 'text-indigo-400',  bgClass: 'bg-indigo-500/10' },
  { type: 'video',           label: 'AI 视频',    desc: '文 / 图生视频',            icon: Video,             color: 'text-violet-400',  bgClass: 'bg-violet-500/10' },
  { type: 'audio',           label: 'AI 音频',    desc: '文生语音 / 音色 / 歌曲',   icon: AudioLines,         color: 'text-emerald-400',  bgClass: 'bg-emerald-500/10' },
  { type: 'script',          label: 'AI 编剧',    desc: '按内容类型策划剧本',       icon: FileCode2,         color: 'text-orange-400',  bgClass: 'bg-orange-500/10' },
  { type: 'screenplay',      label: 'AI 剧本',    desc: '剧本 → 资产 → 分镜',        icon: ScrollText,        color: 'text-pink-400',    bgClass: 'bg-pink-500/10' },
  { type: 'scene',           label: '场景描述',   desc: '描述分镜画面内容',         icon: Camera,            color: 'text-cyan-400',    bgClass: 'bg-cyan-500/10' },
  { type: 'storyboard',      label: '分镜表',     desc: '逐镜管理镜头',             icon: Table2,            color: 'text-teal-400',    bgClass: 'bg-teal-500/10' },
  { type: 'graphic',         label: 'AI 平面',    desc: '海报 / 广告平面设计',      icon: PenTool,           color: 'text-rose-400',    bgClass: 'bg-rose-500/10' },
]

/** Default initial data for node types that need seeded content (storyboard / screenplay). */
export function nodeInitialData(type: NodeType): Partial<CustomNodeData> | undefined {
  if (type === 'storyboard') {
    const rows = [1, 2, 3].map((i) => ({
      sceneIndex: i, description: '', camera: '', dialogue: '',
      shotType: '', blocking: '', action: '', expression: '', cameraAngle: '', composition: '',
      sceneImages: [], characterImages: [], propImages: [],
    }))
    return { content: JSON.stringify(rows), status: 'idle' }
  }
  if (type === 'screenplay') {
    return {
      content: JSON.stringify({ title: '未命名剧本', synopsis: '', content: '' }),
      status: 'idle',
    }
  }
  return undefined
}

export function canvasCenterScreenPoint(sidebarWidth: number) {
  return {
    x: sidebarWidth + (window.innerWidth - sidebarWidth) / 2,
    y: window.innerHeight / 2,
  }
}

export function fitViewAfterNodeMount(fitView: (options: { duration?: number; padding?: number }) => void, padding = 0.18) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      fitView({ duration: 300, padding })
    })
  })
}

const toolbarItems = [
  { id: 'templates'  as const, icon: LayoutTemplate, label: '模板工作流',  shortcut: 'T' },
  { id: 'history'    as const, icon: Clock,           label: '历史记录',    shortcut: 'H' },
  { id: 'materials'  as const, icon: ImageLibrary,    label: '素材库',      shortcut: 'M' },
  { id: 'settings'   as const, icon: Settings,        label: '画布设置',    shortcut: ',' },
]

/** 根据 MIME 类型判断节点类型 */
function getNodeTypeFromFile(file: File): NodeType | null {
  if (file.type.startsWith('image/')) return 'image'
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'audio'
  return null
}

export function SidebarToolbar({ onOpenMaterials, activePanel, onOpenPanel }: SidebarToolbarProps) {
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const addNode = useFlowStore((state) => state.addNode)
  const { screenToFlowPosition } = useReactFlow()
  const sidebarCollapsed = useProjectStore((s) => s.sidebarCollapsed)
  const sidebarWidth = sidebarCollapsed ? 0 : 240

  // ── Close add menu on outside click ──
  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowAddMenu(false)
        setSearchQuery('')
      }
    }
    // Delay listener to avoid immediate close on the same click
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { window.clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [showAddMenu])

  // ── Close on Escape ──
  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowAddMenu(false); setSearchQuery('') }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showAddMenu])

  const handleAddNode = useCallback((type: NodeType) => {
    const position = screenToFlowPosition(canvasCenterScreenPoint(sidebarWidth))
    addNode(type, position, nodeInitialData(type))
    setShowAddMenu(false)
    setSearchQuery('')
  }, [addNode, screenToFlowPosition, sidebarWidth])

  const handleDragStart = (event: React.DragEvent, type: NodeType) => {
    event.dataTransfer.setData('application/reactflow', type)
    event.dataTransfer.effectAllowed = 'move'
  }

  const filteredNodeOptions = searchQuery.trim()
    ? nodeOptions.filter((opt) => opt.label.toLowerCase().includes(searchQuery.toLowerCase()))
    : nodeOptions

  /** 处理文件 → 创建节点 */
  const handleFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    arr.forEach((file, i) => {
      const nodeType = getNodeTypeFromFile(file)
      if (!nodeType) return

      const url = URL.createObjectURL(file)
      const center = canvasCenterScreenPoint(sidebarWidth)
      const position = screenToFlowPosition({ x: center.x + i * 40, y: center.y + i * 40 })

      const mediaData =
        nodeType === 'image' ? { imageUrl: url }
        : nodeType === 'video' ? { videoUrl: url }
        : { audioUrl: url }

      addNode(nodeType, position, {
        label: file.name.replace(/\.[^.]+$/, ''),
        status: 'ready',
        mode: 'input',
        meta: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        ...mediaData,
      })
    })
    setShowAddMenu(false)
  }, [addNode, screenToFlowPosition, sidebarWidth])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div className="fixed left-1/2 bottom-6 z-50 -translate-x-1/2 flex max-w-[calc(100vw-24px)] flex-col items-center gap-3">
      {/* ── Main Toolbar Pill ── */}
      <div ref={menuRef} className="glass flex max-w-full items-center gap-0.5 rounded-full px-1.5 py-1.5 shadow-2xl ring-1 ring-border/40">
        {/* Add Node Button */}
        <div className="relative">
          <PillButton
            icon={showAddMenu ? X : Plus}
            label={showAddMenu ? '关闭菜单' : '添加节点'}
            shortcut="N"
            active={showAddMenu}
            onClick={() => { setShowAddMenu(!showAddMenu); setSearchQuery('') }}
            rotate={showAddMenu}
          />
        </div>

        {/* ── Inline Add Menu ── */}
        {showAddMenu && (
          <div className="flex min-w-0 max-w-[calc(100vw-84px)] flex-wrap items-center gap-0.5 overflow-visible border-l border-border/40 pl-1 animate-in fade-in slide-in-from-left-2 duration-150">
            <div className="relative shrink-0">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/50" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索"
                aria-label="搜索节点类型"
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-8 w-20 rounded-full border border-border/40 bg-muted/30 pl-6 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none"
              />
            </div>
            {filteredNodeOptions.map((opt) => (
              <PillButton
                key={opt.type}
                icon={opt.icon}
                label={opt.label}
                active={false}
                onClick={() => handleAddNode(opt.type)}
                draggable
                onDragStart={(e) => handleDragStart(e, opt.type)}
                iconClassName={opt.color}
              />
            ))}
            <span className="mx-1 h-4 w-px shrink-0 bg-border/40" />
            <PillButton
              icon={Upload}
              label="上传文件"
              onClick={() => fileInputRef.current?.click()}
            />
            <PillButton
              icon={ImageLibrary}
              label="从素材库选择"
              onClick={() => { onOpenMaterials(); setShowAddMenu(false) }}
            />
          </div>
        )}

        {/* Pill divider dot */}
        {!showAddMenu && <span className="mx-1 h-4 w-px bg-border/40" />}

        {/* Tool Items */}
        {toolbarItems.map((item) => (
          <PillButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            shortcut={item.shortcut}
            active={activePanel === item.id}
            onClick={() => onOpenPanel(item.id)}
          />
        ))}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="hidden"
          onChange={handleFileInputChange}
        />
      </div>

      {/* ── Keyboard shortcut hints ── */}
      <div className="hidden xl:block">
        <div className="glass rounded-full px-4 py-1.5 text-[10px] text-muted-foreground/50">
          <kbd className="font-mono text-[10px]">N</kbd> 添加
          {'  ·  '}
          <kbd className="font-mono text-[10px]">{isMac ? '⌘Z' : 'Ctrl+Z'}</kbd> 撤销
          {'  ·  '}
          <kbd className="font-mono text-[10px]">Del</kbd> 删除
        </div>
      </div>
    </div>
  )
}

/* ─── Pill Button for horizontal capsule toolbar ─── */

function PillButton({
  icon: Icon,
  label,
  shortcut,
  active,
  onClick,
  rotate,
  draggable,
  onDragStart,
  iconClassName,
}: {
  icon: typeof Plus
  label: string
  shortcut?: string
  active?: boolean
  onClick?: () => void
  rotate?: boolean
  draggable?: boolean
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void
  iconClassName?: string
}) {
  return (
    <button
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      aria-label={label}
      className={cn(
        'group/pb relative flex size-9 items-center justify-center rounded-full transition-all duration-200',
        active
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className={cn(
        'flex transition-transform duration-200',
        rotate && 'rotate-45',
        !active && 'group-hover/pb:scale-110'
      )}>
        <Icon className={cn('size-4', iconClassName)} />
      </span>

      {/* ── Floating tooltip above pill ── */}
      <div className={cn(
        'pointer-events-none absolute bottom-full left-1/2 z-[80] mb-2 -translate-x-1/2',
        'flex items-center gap-2 rounded-md border border-white/10 bg-[#1b1b1b] px-2.5 py-1 shadow-xl',
        'opacity-0 translate-y-1 transition-all duration-200',
        'group-hover/pb:opacity-100 group-hover/pb:translate-y-0',
        active && '!opacity-0',
      )}>
        <span className="whitespace-nowrap text-[11px] font-medium text-white">{label}</span>
        {shortcut && (
          <kbd className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            {shortcut}
          </kbd>
        )}
        {/* Arrow */}
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-[5px] border-transparent border-t-[#1b1b1b]" />
      </div>
    </button>
  )
}
