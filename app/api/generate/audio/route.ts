/**
 * POST /api/generate/audio
 *
 * 音频/TTS 生成接口（异步任务）。
 *
 * Body: { model, text, voice?, speed?, referenceAudio? }
 * Response: { taskId, status, duration? }
 */

import { NextResponse } from 'next/server'
import { generateAudio, queryAudioTask } from '@/lib/services/ai/index'
import { AIError } from '@/lib/services/ai/types'
import { getAuthUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // Rate limit: 20 audio tasks per 5 minutes per user
  const rl = rateLimit(user.id, 'audio-gen', { limit: 20, windowMs: 5 * 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `音频生成过于频繁，请 ${rl.retryAfter} 秒后重试` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const body = await request.json() as {
      model: string
      text: string
      voice?: string
      speed?: number
      referenceAudio?: string
    }

    if (!body.model || !body.text) {
      return NextResponse.json({ error: '缺少必填参数 model / text' }, { status: 400 })
    }

    const result = await generateAudio({
      model: body.model,
      text: body.text,
      voice: body.voice,
      speed: body.speed,
      referenceAudio: body.referenceAudio,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: err.statusCode })
    }
    console.error('Audio generation error:', err)
    return NextResponse.json({ error: '音频生成失败' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')

  if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })

  try {
    const result = await queryAudioTask(taskId)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: err.statusCode })
    }
    return NextResponse.json({ error: '查询失败' }, { status: 500 })
  }
}
