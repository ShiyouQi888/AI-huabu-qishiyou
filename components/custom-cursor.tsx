'use client'

import { useEffect, useRef } from 'react'

const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[data-cursor="interactive"]',
].join(',')

function getCursorMode(target: EventTarget | null) {
  if (!(target instanceof Element)) return ''
  if (target.closest('input, textarea, [contenteditable="true"]')) return 'is-text'
  if (target.closest('.react-flow__node, [data-cursor="drag"]')) return 'is-drag'
  if (target.closest(INTERACTIVE_SELECTOR)) return 'is-interactive'
  return ''
}

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cursor = cursorRef.current
    const pointerMedia = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!cursor || !pointerMedia.matches) return

    let frame = 0
    let x = -100
    let y = -100
    let nextX = x
    let nextY = y

    const render = () => {
      x += (nextX - x) * 0.42
      y += (nextY - y) * 0.42
      cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`
      frame = window.requestAnimationFrame(render)
    }

    const handlePointerMove = (event: PointerEvent) => {
      nextX = event.clientX
      nextY = event.clientY
      const mode = getCursorMode(event.target)
      cursor.classList.add('is-visible')
      cursor.classList.toggle('is-interactive', mode === 'is-interactive')
      cursor.classList.toggle('is-text', mode === 'is-text')
      cursor.classList.toggle('is-drag', mode === 'is-drag')
    }

    const handlePointerDown = () => cursor.classList.add('is-pressed')
    const handlePointerUp = () => cursor.classList.remove('is-pressed')
    const handlePointerLeave = () => cursor.classList.remove('is-visible')

    document.body.classList.add('has-custom-cursor')
    document.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.addEventListener('pointerdown', handlePointerDown, { passive: true })
    document.addEventListener('pointerup', handlePointerUp, { passive: true })
    document.addEventListener('pointerleave', handlePointerLeave, { passive: true })
    frame = window.requestAnimationFrame(render)

    return () => {
      document.body.classList.remove('has-custom-cursor')
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('pointerup', handlePointerUp)
      document.removeEventListener('pointerleave', handlePointerLeave)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={cursorRef} className="custom-cursor" aria-hidden="true">
      <span className="custom-cursor__ring" />
      <span className="custom-cursor__crosshair" />
      <span className="custom-cursor__core" />
    </div>
  )
}
