'use client'

import { useState, useEffect } from 'react'
import {
  HelpCircle, X, MousePointerClick, Workflow, Boxes, Film,
  Wand2, Link2, Keyboard, BookOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface HelpDialogProps {
  open: boolean
  onClose: () => void
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const [tab, setTab] = useState<'guide' | 'keys'>('guide')
  const [isMac, setIsMac] = useState(false)

  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform) || /mac os/i.test(navigator.userAgent))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const mod = isMac ? '⌘' : 'Ctrl'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />

      <div className="glass relative z-10 flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <HelpCircle className="size-4" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-foreground">帮助</h2>
              <p className="text-[11px] text-muted-foreground">使用指南与快捷键</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="关闭 (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-border/40 px-4 pt-3">
          <TabBtn active={tab === 'guide'} onClick={() => setTab('guide')} icon={<BookOpen className="size-3.5" />}>使用指南</TabBtn>
          <TabBtn active={tab === 'keys'} onClick={() => setTab('keys')} icon={<Keyboard className="size-3.5" />}>快捷键</TabBtn>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'guide' ? <Guide /> : <Shortcuts mod={mod} />}
        </div>

        {/* Footer */}
        <div className="border-t border-border/40 px-5 py-2.5 text-[11px] text-muted-foreground/70">
          按 <Kbd>Esc</Kbd> 关闭 · 按 <Kbd>?</Kbd> 随时打开帮助
        </div>
      </div>
    </div>
  )
}

// ── Usage guide ──────────────────────────────────────────────────────────────

const GUIDE_STEPS: Array<{ icon: React.ReactNode; title: string; desc: string }> = [
  { icon: <MousePointerClick className="size-4" />, title: '添加节点', desc: '从左侧工具栏点击或拖拽，把节点放到画布上；也可直接把本地图片/视频/音频拖入画布。' },
  { icon: <Link2 className="size-4" />, title: '连接节点', desc: '拖动节点右侧的输出端口到另一个节点左侧的输入端口，上游内容会作为下游的上下文。' },
  { icon: <Wand2 className="size-4" />, title: 'AI 编剧', desc: '选择内容类型（短剧 / 电影 / 短视频 等），填写故事方向后生成脚本，不同类型有各自的专业规划。' },
  { icon: <Film className="size-4" />, title: '短剧工作流', desc: '剧本节点 →「提取资产 + 生成剧集列表」→ 在剧集列表里逐集点击「生成分镜」，角色/场景会自动关联。' },
  { icon: <Boxes className="size-4" />, title: '打组整理', desc: '按住 Ctrl 框选节点后右键「打组」，或直接把节点拖进分组容器；容器可命名、缩放，随画布保存。' },
  { icon: <Workflow className="size-4" />, title: '生成内容', desc: '在节点内选择模型后点击生成按钮；生成结果会显示在下游的结果节点中。' },
]

function Guide() {
  return (
    <div className="space-y-2.5">
      {GUIDE_STEPS.map((s, i) => (
        <div key={i} className="flex gap-3 rounded-xl border border-border/40 bg-muted/10 px-3.5 py-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {s.icon}
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-foreground">{s.title}</div>
            <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{s.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Shortcuts ────────────────────────────────────────────────────────────────

function Shortcuts({ mod }: { mod: string }) {
  const groups: Array<{ title: string; items: Array<{ label: string; keys: string[] }> }> = [
    {
      title: '选择',
      items: [
        { label: '框选节点', keys: [mod, '拖拽'] },
        { label: '加选 / 多选节点', keys: [mod, '点击'] },
        { label: '平移画布', keys: ['拖拽空白处'] },
      ],
    },
    {
      title: '编辑',
      items: [
        { label: '复制选中节点', keys: [mod, 'D'] },
        { label: '打组选中节点', keys: [mod, 'G'] },
        { label: '删除选中节点 / 连线', keys: ['Delete'] },
        { label: '撤销', keys: [mod, 'Z'] },
        { label: '重做', keys: [mod, 'Shift', 'Z'] },
        { label: '重命名节点', keys: ['双击标题'] },
      ],
    },
    {
      title: '视图',
      items: [
        { label: '缩放画布', keys: ['滚轮'] },
        { label: '适应画布', keys: [mod, '0'] },
        { label: '打开帮助', keys: ['?'] },
      ],
    },
    {
      title: '分组',
      items: [
        { label: '把节点加入分组', keys: ['拖入容器'] },
        { label: '打组 / 解组 / 删除', keys: ['右键菜单'] },
      ],
    },
  ]

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.title}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">{g.title}</div>
          <div className="overflow-hidden rounded-xl border border-border/40">
            {g.items.map((item, i) => (
              <div
                key={item.label}
                className={cn(
                  'flex items-center justify-between px-3.5 py-2',
                  i > 0 && 'border-t border-border/30',
                )}
              >
                <span className="text-[12px] text-foreground/80">{item.label}</span>
                <div className="flex items-center gap-0.5">
                  {item.keys.map((k, j) => (
                    <span key={j} className="flex items-center gap-0.5">
                      {j > 0 && <span className="mx-0.5 text-[11px] text-muted-foreground/40">+</span>}
                      <Kbd>{k}</Kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Bits ─────────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[12px] font-medium transition-colors',
        active
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[22px] items-center justify-center rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] font-medium text-foreground/80 shadow-sm">
      {children}
    </kbd>
  )
}
