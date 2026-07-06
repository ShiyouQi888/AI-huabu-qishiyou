'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { RefreshCw, ChevronsRight, Check, X } from 'lucide-react'

// Canvas / piece dimensions
const CW = 280        // canvas width
const CH = 130        // canvas height
const PS = 46         // piece size (square)
const PY = (CH - PS) / 2   // piece y = 42 (vertically centered)
const TRACK_MAX = CW - PS  // max slider offset = 234
const MIN_TARGET = 72
const MAX_TARGET = CW - PS - 28  // = 206
const TOL = 7         // match tolerance in pixels

// ── Background generation ─────────────────────────────────────────────────────

function generatePuzzle(bg: HTMLCanvasElement, pc: HTMLCanvasElement): number {
  const bgCtx = bg.getContext('2d')!
  const pcCtx = pc.getContext('2d')!

  // Seeded LCG
  let s = ((Date.now() ^ (Math.random() * 0x100000000)) >>> 0)
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
  const ri = (max: number, min = 0) => Math.floor(rng() * (max - min) + min)

  // Dark gradient base
  const bases = [['#0e0a06', '#1a1208'], ['#060c14', '#0c1820'], ['#0a0610', '#160c22'], ['#060e06', '#0c1a0c']]
  const [c1, c2] = bases[ri(bases.length)]
  const grad = bgCtx.createLinearGradient(0, 0, CW, CH)
  grad.addColorStop(0, c1); grad.addColorStop(1, c2)
  bgCtx.fillStyle = grad
  bgCtx.fillRect(0, 0, CW, CH)

  // Colorful bokeh blobs
  const palettes = [
    ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#a855f7', '#ec4899'],
    ['#f97316', '#06b6d4', '#84cc16', '#fb7185', '#8b5cf6', '#fbbf24'],
    ['#e879f9', '#22d3ee', '#4ade80', '#fb923c', '#60a5fa', '#34d399'],
  ]
  const pal = palettes[ri(palettes.length)]
  for (let i = 0; i < 11; i++) {
    const x = rng() * CW, y = rng() * CH, r = ri(44, 12)
    const color = pal[ri(pal.length)]
    const g = bgCtx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, color + 'cc')
    g.addColorStop(0.5, color + '55')
    g.addColorStop(1, color + '00')
    bgCtx.beginPath()
    bgCtx.arc(x, y, r, 0, Math.PI * 2)
    bgCtx.fillStyle = g
    bgCtx.fill()
  }

  // Subtle grid lines
  bgCtx.strokeStyle = 'rgba(255,255,255,0.055)'
  bgCtx.lineWidth = 0.5
  for (let x = 0; x <= CW; x += 18) { bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, CH); bgCtx.stroke() }
  for (let y = 0; y <= CH; y += 18) { bgCtx.beginPath(); bgCtx.moveTo(0, y); bgCtx.lineTo(CW, y); bgCtx.stroke() }

  // Bright sparkle dots
  for (let i = 0; i < 14; i++) {
    bgCtx.beginPath()
    bgCtx.arc(rng() * CW, rng() * CH, rng() * 1.2 + 0.4, 0, Math.PI * 2)
    bgCtx.fillStyle = `rgba(255,255,255,${0.22 + rng() * 0.5})`
    bgCtx.fill()
  }

  // Target position
  const targetX = ri(MAX_TARGET, MIN_TARGET)

  // Extract piece image
  const pieceData = bgCtx.getImageData(targetX, PY, PS, PS)

  // Draw hole: dark fill + border + dot texture
  bgCtx.fillStyle = 'rgba(0,0,0,0.54)'
  bgCtx.fillRect(targetX, PY, PS, PS)
  bgCtx.strokeStyle = 'rgba(255,255,255,0.25)'
  bgCtx.lineWidth = 1.5
  bgCtx.strokeRect(targetX + 0.75, PY + 0.75, PS - 1.5, PS - 1.5)
  bgCtx.fillStyle = 'rgba(255,255,255,0.05)'
  for (let dx = 5; dx < PS; dx += 9) for (let dy = 5; dy < PS; dy += 9) bgCtx.fillRect(targetX + dx, PY + dy, 1.5, 1.5)

  // Render piece onto piece canvas
  pcCtx.clearRect(0, 0, PS, PS)
  pcCtx.putImageData(pieceData, 0, 0)

  // Piece bright border
  pcCtx.strokeStyle = 'rgba(255,255,255,0.88)'
  pcCtx.lineWidth = 1.5
  pcCtx.strokeRect(0.75, 0.75, PS - 1.5, PS - 1.5)

  // Piece top-to-bottom sheen
  const sheen = pcCtx.createLinearGradient(0, 0, 0, PS)
  sheen.addColorStop(0, 'rgba(255,255,255,0.15)')
  sheen.addColorStop(1, 'rgba(0,0,0,0.08)')
  pcCtx.fillStyle = sheen
  pcCtx.fillRect(0, 0, PS, PS)

  return targetX
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CaptchaDialogProps {
  onVerified: () => void
  onClose: () => void
}

export function CaptchaDialog({ onVerified, onClose }: CaptchaDialogProps) {
  const bgRef = useRef<HTMLCanvasElement>(null)
  const pcRef = useRef<HTMLCanvasElement>(null)
  const offsetRef = useRef(0)

  const [offset, setOffset] = useState(0)
  const [targetX, setTargetX] = useState(0)
  const [status, setStatus] = useState<'idle' | 'success' | 'fail'>('idle')
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartX, setDragStartX] = useState(0)
  const [offsetAtDrag, setOffsetAtDrag] = useState(0)

  const generate = useCallback(() => {
    if (!bgRef.current || !pcRef.current) return
    const tx = generatePuzzle(bgRef.current, pcRef.current)
    setTargetX(tx)
    offsetRef.current = 0
    setOffset(0)
    setStatus('idle')
    setIsDragging(false)
  }, [])

  useEffect(() => { generate() }, [generate])

  const verify = useCallback((pos: number) => {
    if (Math.abs(pos - targetX) <= TOL) {
      setStatus('success')
      setTimeout(onVerified, 600)
    } else {
      setStatus('fail')
      setTimeout(generate, 900)
    }
  }, [targetX, onVerified, generate])

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (status !== 'idle') return
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    setDragStartX(e.clientX)
    setOffsetAtDrag(offsetRef.current)
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const next = Math.max(0, Math.min(TRACK_MAX, offsetAtDrag + e.clientX - dragStartX))
    offsetRef.current = next
    setOffset(next)
  }

  const onUp = () => {
    if (!isDragging) return
    setIsDragging(false)
    verify(offsetRef.current)
  }

  const ok = status === 'success'
  const fail = status === 'fail'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
      <div
        className="relative z-10 w-[316px] overflow-hidden rounded-2xl border border-[#e0ddd6] bg-[#f5f4f0] shadow-[0_24px_64px_rgba(0,0,0,0.28)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e0ddd6] px-4 py-3">
          <div>
            <p className="text-[12px] font-semibold text-[#1a1916]">安全验证</p>
            <p className="text-[10px] text-[#9a9690]">拖动滑块，将拼图移到正确位置</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={generate}
              disabled={ok}
              className="rounded-lg p-1.5 text-[#9a9690] transition-colors hover:bg-[#e8e6e0] hover:text-[#1a1916] disabled:opacity-30"
              title="换一张"
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-[#9a9690] transition-colors hover:bg-[#e8e6e0] hover:text-[#1a1916]">
              <X className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Puzzle image */}
        <div className="px-[18px] pt-3.5 pb-1">
          <div className={`relative overflow-hidden rounded-xl ring-[1.5px] transition-all ${ok ? 'ring-emerald-400' : fail ? 'ring-red-400' : 'ring-[#e0ddd6]'}`}>
            {/* Background canvas */}
            <canvas ref={bgRef} width={CW} height={CH} className="block" />
            {/* Moving piece */}
            <canvas
              ref={pcRef}
              width={PS}
              height={PS}
              className="pointer-events-none absolute"
              style={{ left: offset, top: PY, width: PS, height: PS }}
            />
            {/* Success overlay */}
            {ok && (
              <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/15">
                <div className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-1.5 text-white shadow-lg">
                  <Check className="size-3.5" />
                  <span className="text-[11px] font-semibold">验证成功</span>
                </div>
              </div>
            )}
            {/* Fail overlay */}
            {fail && (
              <div className="absolute inset-0 flex items-center justify-center bg-red-500/10 backdrop-blur-[1px]">
                <span className="rounded-full bg-red-500 px-3 py-1 text-[11px] font-semibold text-white">位置不对，请重试</span>
              </div>
            )}
          </div>
        </div>

        {/* Slider track */}
        <div className="px-[18px] pb-4 pt-2.5">
          <div className={`relative h-10 select-none overflow-hidden rounded-xl border transition-colors ${
            ok ? 'border-emerald-300 bg-emerald-50' : fail ? 'border-red-300 bg-red-50' : 'border-[#e0ddd6] bg-[#eceae4]'
          }`}>
            {ok ? (
              <div className="flex h-full items-center justify-center gap-1.5 text-[12px] font-semibold text-emerald-600">
                <Check className="size-4" /> 验证通过
              </div>
            ) : (
              <>
                {/* Progress fill */}
                <div
                  className={`absolute left-0 top-0 h-full transition-none ${fail ? 'bg-red-200/60' : 'bg-[#d4d0c8]/60'}`}
                  style={{ width: offset + PS / 2 }}
                />
                {/* Drag handle */}
                <div
                  className={`absolute top-0 flex h-10 cursor-grab touch-none items-center justify-center rounded-xl shadow transition-colors active:cursor-grabbing ${
                    fail ? 'bg-red-400' : isDragging ? 'bg-[#2e2d29]' : 'bg-[#1a1916]'
                  }`}
                  style={{ left: offset, width: PS }}
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                >
                  <ChevronsRight className="size-4 text-[#f5f4f0]" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
