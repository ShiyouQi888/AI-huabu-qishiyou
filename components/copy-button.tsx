'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  text?: string | null
  label?: string
  copiedLabel?: string
  title?: string
  className?: string
  iconOnly?: boolean
}

export function CopyButton({
  text,
  label = '复制',
  copiedLabel = '已复制',
  title,
  className,
  iconOnly = false,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)
  const canCopy = !!text?.trim()

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (!canCopy) return
    try {
      await navigator.clipboard.writeText(text!.trim())
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={handleCopy}
      disabled={!canCopy}
      title={title ?? label}
      aria-label={title ?? label}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground/55 transition-colors hover:bg-muted/35 hover:text-foreground disabled:pointer-events-none disabled:opacity-25',
        iconOnly && 'size-6 px-0 py-0',
        className,
      )}
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
      {!iconOnly && <span>{copied ? copiedLabel : label}</span>}
    </button>
  )
}
