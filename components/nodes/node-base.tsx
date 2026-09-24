'use client'

import { ReactNode, forwardRef, useState, useRef, useEffect } from 'react'
import { Handle, Position } from '@xyflow/react'
import { X } from 'lucide-react'
import { NodeType, useFlowStore } from '@/lib/store'

const statusLabel: Record<string, string> = {
  idle:       '待输入',
  ready:      '已就绪',
  generating: '生成中',
  completed:  '已完成',
  failed:     '失败',
}

const statusColor: Record<string, string> = {
  idle:       'text-muted-foreground bg-muted/50',
  ready:      'text-emerald-500 bg-emerald-500/10',
  generating: 'text-blue-400 bg-blue-400/10',
  completed:  'text-emerald-400 bg-emerald-400/10',
  failed:     'text-destructive bg-destructive/10',
}

interface InputPort {
  id: string
  label: string
  color?: string
  top?: string
}

interface OutputPort {
  id: string
  label?: string
  color?: string
  top?: string
}

interface LeftHandle {
  id: string
  top: string
  color?: string
}

interface NodeBaseProps {
  nodeId: string
  nodeType: NodeType
  label: string
  status?: string
  selected?: boolean
  onDelete: () => void
  icon: ReactNode
  badge?: ReactNode
  hasInput?: boolean
  hasOutput?: boolean
  inputPorts?: InputPort[]
  outputPorts?: OutputPort[]
  leftHandles?: LeftHandle[]
  children: ReactNode
  footer?: ReactNode
  width?: string
  widthPx?: number
  noPadding?: boolean
  /** 编辑画布等交互态下禁止 React Flow 拖动节点 */
  stopNodeDrag?: boolean
  onNodePointerDown?: React.PointerEventHandler<HTMLDivElement>
}

export const NodeBase = forwardRef<HTMLDivElement, NodeBaseProps>(function NodeBase({
  nodeId,
  label,
  status = 'idle',
  selected,
  onDelete,
  icon,
  badge,
  hasInput = true,
  hasOutput = true,
  inputPorts,
  outputPorts,
  leftHandles,
  children,
  footer,
  width = 'w-[320px]',
  widthPx,
  noPadding = false,
  stopNodeDrag = false,
  onNodePointerDown,
}: NodeBaseProps, ref) {
  const updateNodeData = useFlowStore((s) => s.updateNodeData)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(label)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(label)
    setEditing(true)
  }

  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== label) {
      updateNodeData(nodeId, { label: trimmed })
    }
    setEditing(false)
  }

  const cancelEdit = () => {
    setEditValue(label)
    setEditing(false)
  }

  return (
    <div ref={ref} data-node-id={nodeId} onPointerDown={(e) => { if (stopNodeDrag) e.stopPropagation(); onNodePointerDown?.(e) }} className={`relative ${widthPx ? '' : width}`} style={widthPx ? { width: widthPx } : undefined}>
      <div
        className={`
          relative rounded-2xl border bg-card h-full overflow-hidden
          shadow-xl transition-shadow duration-200
          ${selected ? 'node-selected-ring border-transparent' : 'border-border/60 shadow-black/20'}
        `}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span className="text-muted-foreground">{icon}</span>

          {editing ? (
            <input
              ref={inputRef}
              className="nodrag flex-1 min-w-0 bg-transparent text-[15px] font-bold text-foreground outline-none border-b border-primary/60 pb-px"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                e.stopPropagation()
              }}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="flex-1 truncate text-[15px] font-bold text-foreground cursor-text select-none"
              onDoubleClick={startEdit}
              title="双击编辑名称"
            >
              {label}
            </span>
          )}

          {badge}
          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[13px] font-medium ${statusColor[status] ?? statusColor.idle}`}>
            {statusLabel[status] ?? status}
          </span>
        </div>

        {!noPadding && <div className="mx-3.5 h-px bg-border/40" />}

        <div className={noPadding ? 'overflow-hidden' : 'overflow-hidden px-3.5 py-3'}>
          {children}
        </div>

        {footer && (
          <>
            <div className="mx-3.5 h-px bg-border/40" />
            <div className="px-3.5 py-3">{footer}</div>
          </>
        )}
      </div>

      {/* Delete button */}
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="
          absolute -right-2.5 -top-2.5 z-20
          flex size-6 items-center justify-center
          rounded-full border border-border bg-card
          text-muted-foreground shadow-md
          transition-all duration-150
          hover:scale-110 hover:border-destructive hover:bg-destructive hover:text-white
        "
      >
        <X className="size-3" />
      </button>

      {/* Input handle(s) */}
      {inputPorts && inputPorts.length > 0 ? (
        inputPorts.map((port, i) => {
          const top = port.top ?? `${((i + 1) / (inputPorts.length + 1)) * 100}%`
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="target"
              position={Position.Left}
              className={`${port.color || '!bg-primary !border-background !border-2'} !z-30`}
              style={{ top }}
            />
          )
        })
      ) : (
        hasInput && (
          <Handle
            id="input"
            type="target"
            position={Position.Left}
            className="!z-30"
            style={{ top: '50%' }}
          />
        )
      )}

      {/* Output handle(s) */}
      {outputPorts && outputPorts.length > 0 ? (
        outputPorts.map((port, i) => {
          const top = port.top ?? `${((i + 1) / (outputPorts.length + 1)) * 100}%`
          return (
            <Handle
              key={port.id}
              id={port.id}
              type="source"
              position={Position.Right}
              className={`${port.color || '!bg-primary !border-background !border-2'} !z-30`}
              style={{ top }}
            />
          )
        })
      ) : (
        hasOutput && (
          <Handle
            id="output"
            type="source"
            position={Position.Right}
            className="!z-30"
            style={{ top: '50%' }}
          />
        )
      )}

      {/* Extra left handles */}
      {leftHandles?.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type="target"
          position={Position.Left}
          className={`${h.color ?? '!bg-primary !border-background !border-2'} !z-30`}
          style={{ top: h.top }}
        />
      ))}
    </div>
  )
})
