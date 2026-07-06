'use client'

import { memo, useState, useRef, useEffect } from 'react'
import { NodeProps, Node, NodeResizer } from '@xyflow/react'
import { Boxes, Unlink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CustomNodeData, useFlowStore } from '@/lib/store'

type GroupNodeProps = NodeProps<Node<CustomNodeData>>

function GroupNode({ id, data, selected }: GroupNodeProps) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const ungroupNodes = useFlowStore((s) => s.ungroupNodes)
  const deleteGroupAndChildren = useFlowStore((s) => s.deleteGroupAndChildren)
  const childCount = useFlowStore((s) => s.nodes.filter((n) => n.parentId === id).length)
  const isDropTarget = useFlowStore((s) => s.dragOverGroupId === id)

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(data.label)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select() }
  }, [editing])

  const commit = () => {
    const t = value.trim()
    if (t && t !== data.label) updateNodeData(id, { label: t })
    else setValue(data.label)
    setEditing(false)
  }

  return (
    <div className="group/gr size-full">
      <NodeResizer
        color="var(--primary)"
        isVisible={selected}
        minWidth={240}
        minHeight={160}
        handleClassName="!size-2.5 !rounded-sm !border-2 !border-background"
        lineClassName="!border-primary/50"
      />

      <div
        className={cn(
          'size-full overflow-hidden rounded-2xl border-2 shadow-lg transition-all',
          isDropTarget
            ? 'border-solid border-primary bg-primary/[0.14] shadow-primary/25 ring-2 ring-primary/40'
            : selected
              ? 'border-solid border-primary/70 bg-primary/[0.08] shadow-primary/10'
              : 'border-dashed border-primary/45 bg-primary/[0.05] shadow-black/10',
        )}
      >
        {/* Filled header strip — reads clearly as a titled container */}
        <div
          className={cn(
            'flex items-center gap-2 border-b px-3 py-2.5 backdrop-blur-sm transition-colors',
            isDropTarget ? 'border-primary/40 bg-primary/20'
              : selected ? 'border-primary/30 bg-primary/[0.14]'
              : 'border-primary/20 bg-primary/[0.10]',
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-primary">
            <Boxes className="size-3.5" />
          </span>

          {editing ? (
            <input
              ref={inputRef}
              className="nodrag min-w-0 flex-1 border-b border-primary/60 bg-transparent pb-px text-[13px] font-bold text-foreground outline-none"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit() }
                if (e.key === 'Escape') { e.preventDefault(); setValue(data.label); setEditing(false) }
                e.stopPropagation()
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="min-w-0 flex-1 cursor-text truncate text-[13px] font-bold text-foreground select-none"
              onDoubleClick={(e) => { e.stopPropagation(); setValue(data.label); setEditing(true) }}
              title="双击重命名"
            >
              {data.label}
            </span>
          )}

          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium tabular-nums text-primary/90">
            {childCount} 个节点
          </span>

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); ungroupNodes(id) }}
            title="解组（保留节点）"
            className="nodrag flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted/50 hover:text-foreground group-hover/gr:opacity-100"
          >
            <Unlink className="size-3" />
            解组
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); deleteGroupAndChildren(id) }}
            title="删除分组及其中节点"
            className="nodrag flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-destructive hover:text-white group-hover/gr:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>

        {/* Empty-state / drop hint */}
        {childCount === 0 && (
          <div className="pointer-events-none flex h-[calc(100%-46px)] items-center justify-center">
            <span className="text-[12px] font-medium text-primary/50">拖入节点以加入分组</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(GroupNode)
