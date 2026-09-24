/**
 * POST /api/generate/song
 * GET  /api/generate/song?taskId=...&model=...
 */

import { NextResponse } from 'next/server'
import { generateSong, querySongTask } from '@/lib/services/ai/index'
import { AIError } from '@/lib/services/ai/types'
import { getAuthUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const rl = rateLimit(user.id, 'song-gen', { limit: 5, windowMs: 10 * 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `歌曲生成过于频繁，请 ${rl.retryAfter} 秒后重试` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const body = await request.json() as {
      model: string
      prompt: string
      lyrics?: string
      title?: string
      style?: string
      instrumental?: boolean
    }
    if (!body.model || !body.prompt) {
      return NextResponse.json({ error: '缺少必填参数 model / prompt' }, { status: 400 })
    }
    return NextResponse.json(await generateSong(body))
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: err.statusCode })
    }
    console.error('Song generation error:', err)
    return NextResponse.json({ error: '歌曲生成失败' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  const params = new URL(request.url).searchParams
  const taskId = params.get('taskId')
  if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })

  try {
    return NextResponse.json(await querySongTask(taskId, params.get('model') || 'suno-v6'))
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: err.statusCode })
    }
    return NextResponse.json({ error: '歌曲任务查询失败' }, { status: 500 })
  }
}
