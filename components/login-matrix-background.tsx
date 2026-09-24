'use client'

import { useEffect, useRef } from 'react'

type MatrixPoint = {
  x: number
  y: number
  distance: number
}

export function LoginMatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const context = canvas.getContext('2d')
    if (!context) return

    let width = 0
    let height = 0
    let devicePixelRatio = 1
    let spacing = 32
    let maxRadius = 0
    let points: MatrixPoint[] = []
    let frame = 0
    const startTime = performance.now()

    const resize = () => {
      const bounds = canvas.getBoundingClientRect()
      width = bounds.width
      height = bounds.height
      devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      spacing = Math.max(26, Math.min(38, Math.min(width, height) / 24))
      maxRadius = Math.hypot(width / 2, height / 2) + spacing

      canvas.width = Math.floor(width * devicePixelRatio)
      canvas.height = Math.floor(height * devicePixelRatio)
      context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

      const columns = Math.ceil(width / spacing) + 2
      const rows = Math.ceil(height / spacing) + 2
      const offsetX = (width - (columns - 1) * spacing) / 2
      const offsetY = (height - (rows - 1) * spacing) / 2
      const centerX = width / 2
      const centerY = height / 2

      points = []
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = offsetX + column * spacing
          const y = offsetY + row * spacing
          points.push({ x, y, distance: Math.hypot(x - centerX, y - centerY) })
        }
      }
    }

    const draw = (time: number) => {
      const elapsed = (time - startTime) / 1000
      const cycle = 7.2
      const progress = (elapsed % cycle) / cycle
      const radius = progress * maxRadius
      const waveWidth = Math.max(48, spacing * 2.2)

      context.clearRect(0, 0, width, height)

      for (const point of points) {
        const distanceFromWave = Math.abs(point.distance - radius)
        const waveStrength = Math.max(0, 1 - distanceFromWave / waveWidth)
        const intensity = waveStrength * waveStrength
        const alpha = 0.07 + intensity * 0.64
        const dotRadius = 0.85 + intensity * 1.05

        context.beginPath()
        context.fillStyle = `rgba(245, 244, 240, ${alpha})`
        context.arc(point.x, point.y, dotRadius, 0, Math.PI * 2)
        context.fill()
      }

      frame = window.requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    frame = window.requestAnimationFrame(draw)

    return () => {
      window.removeEventListener('resize', resize)
      window.cancelAnimationFrame(frame)
    }
  }, [])

  return <canvas ref={canvasRef} className="login-matrix-background" aria-hidden="true" />
}
