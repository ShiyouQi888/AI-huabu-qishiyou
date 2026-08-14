/**
 * POST /api/generate/video
 *
 * 视频生成接口（异步任务）。
 *
 * Body: { model, prompt, negativePrompt?, duration?, resolution?, ratio?, firstFrameImage?, lastFrameImage?, referenceVideo? }
 * Response: { taskId, status, estimatedSeconds? }
 *
 * GET /api/generate/video?taskId=xxx
 * 查询视频生成任务状态。Response: { taskId, status, videoUrl? }
 */

import { NextResponse } from 'next/server'
import { generateVideo, queryVideoTask } from '@/lib/services/ai/index'
import { AIError } from '@/lib/services/ai/types'
import { downloadToLocal } from '@/lib/download-to-local'
import { getAuthUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // Rate limit: 10 video submissions per 5 minutes per user
  const rl = rateLimit(user.id, 'video-gen', { limit: 10, windowMs: 5 * 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `视频提交过于频繁，请 ${rl.retryAfter} 秒后重试` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const body = await request.json() as {
      model: string
      prompt: string
      negativePrompt?: string
      duration?: number
      resolution?: string
      ratio?: string
      firstFrameImage?: string
      lastFrameImage?: string
      referenceVideo?: string
      references?: Array<{ label: string; url: string; type?: 'image' | 'video' }>
    }

    if (!body.model || !body.prompt) {
      return NextResponse.json({ error: '缺少必填参数 model / prompt' }, { status: 400 })
    }

    const result = await generateVideo({
      model: body.model,
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      duration: body.duration,
      resolution: body.resolution,
      ratio: body.ratio,
      firstFrameImage: body.firstFrameImage,
      lastFrameImage: body.lastFrameImage,
      referenceVideo: body.referenceVideo,
      references: body.references,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: err.statusCode })
    }
    console.error('Video generation error:', err)
    return NextResponse.json({ error: '视频生成失败' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId')

  if (!taskId) return NextResponse.json({ error: '缺少 taskId' }, { status: 400 })

  try {
    const provider = searchParams.get('provider') || undefined
    const result = await queryVideoTask(taskId, provider)

    if (result.status === 'completed' && result.videoUrl && !result.videoUrl.startsWith('/uploads/') && !result.videoUrl.startsWith('data:')) {
      try {
        result.videoUrl = await downloadToLocal(result.videoUrl, 'video')
      } catch (e) {
        console.error('[视频落库] 下载失败，返回原始URL:', e)
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: err.statusCode })
    }
    console.error('Video task query error:', err)
    return NextResponse.json({ error: '任务查询失败' }, { status: 500 })
  }
}
