/**
 * POST /api/generate/image
 *
 * 图片生成接口。支持文生图、图生图。
 *
 * Body: { model, prompt, negativePrompt?, ratio?, width?, height?, count?, referenceImage?, styleReference? }
 *   ratio: '1:1' | '16:9' | '9:16' | '4:3' | '3:4' — 自动转换为对应尺寸
 * Response: { imageUrl }
 */

import { NextResponse } from 'next/server'
import { generateImage } from '@/lib/services/ai/index'
import { AIError } from '@/lib/services/ai/types'
import { downloadToLocal } from '@/lib/download-to-local'
import { getAuthUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

/** 比例 → 常用像素尺寸（兼顾各平台最优分辨率） */
const RATIO_TO_SIZE: Record<string, { width: number; height: number }> = {
  '1:1':   { width: 1024, height: 1024 },
  '16:9':  { width: 1280, height: 720  },
  '9:16':  { width: 720,  height: 1280 },
  '4:3':   { width: 1024, height: 768  },
  '3:4':   { width: 768,  height: 1024 },
}

export async function POST(request: Request) {
  // Auth check
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // Rate limit: 20 images per minute per user
  const rl = rateLimit(user.id, 'image-gen', { limit: 20, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `生成过于频繁，请 ${rl.retryAfter} 秒后重试` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const body = await request.json() as {
      model: string
      prompt: string
      negativePrompt?: string
      ratio?: string
      width?: number
      height?: number
      count?: number
      referenceImage?: string
      styleReference?: string
    }

    if (!body.model || !body.prompt) {
      return NextResponse.json({ error: '缺少必填参数 model / prompt' }, { status: 400 })
    }

    // Resolve dimensions: explicit > ratio preset > default
    let { width, height } = body
    if ((!width || !height) && body.ratio) {
      const preset = RATIO_TO_SIZE[body.ratio]
      if (preset) ({ width, height } = preset)
    }
    width  ??= 1024
    height ??= 1024

    const result = await generateImage({
      model: body.model,
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      width,
      height,
      count: body.count,
      referenceImage: body.referenceImage,
      styleReference: body.styleReference,
    })

    if (result.imageUrl && !result.imageUrl.startsWith('/uploads/') && !result.imageUrl.startsWith('data:')) {
      try {
        result.imageUrl = await downloadToLocal(result.imageUrl, 'image')
      } catch (e) {
        console.error('[图片落库] 下载失败，返回原始URL:', e)
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AIError) {
      return NextResponse.json({ error: err.message, provider: err.provider }, { status: err.statusCode })
    }
    console.error('Image generation error:', err)
    return NextResponse.json({ error: '图片生成失败' }, { status: 500 })
  }
}
