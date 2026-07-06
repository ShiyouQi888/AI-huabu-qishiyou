/**
 * POST /api/generate/text
 *
 * 文本生成接口。支持串联上游节点输出作为上下文。
 *
 * Body: { model, prompt, systemPrompt?, temperature?, maxTokens?, contextTexts?, stream? }
 *
 * 非流式: { text, model, usage? }
 * 流式 (stream: true): SSE 格式
 *   event: reasoning → 思考过程块
 *   event: text      → 正文块
 *   event: done      → 完成 (含完整文本)
 *   event: error     → 错误
 */

import { NextResponse } from 'next/server'
import { generateText, generateTextStream } from '@/lib/services/ai/index'
import { AIError } from '@/lib/services/ai/types'
import { getAuthUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // Auth check
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  // Rate limit: 60 requests per minute per user
  const rl = rateLimit(user.id, 'text-gen', { limit: 60, windowMs: 60_000 })
  if (!rl.ok) {
    return NextResponse.json(
      { error: `请求过于频繁，请 ${rl.retryAfter} 秒后重试` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } },
    )
  }

  try {
    const body = await request.json() as {
      model: string
      prompt: string
      systemPrompt?: string
      temperature?: number
      maxTokens?: number
      contextTexts?: string[]
      stream?: boolean
    }

    if (!body.model || !body.prompt) {
      return NextResponse.json({ error: '缺少必填参数 model / prompt' }, { status: 400 })
    }

    const req = {
      model: body.model,
      prompt: body.prompt,
      systemPrompt: body.systemPrompt,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      contextTexts: body.contextTexts,
    }

    // ── 流式模式 ──
    if (body.stream) {
      const stream = await generateTextStream(req)
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    }

    // ── 非流式模式 ──
    const result = await generateText(req)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof AIError || (err instanceof Error && err.name === 'AIError')) {
      const ae = err as AIError
      return NextResponse.json(
        { error: ae.message, provider: ae.provider },
        { status: ae.statusCode || 500 },
      )
    }
    console.error('Text generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '文本生成失败' },
      { status: 500 },
    )
  }
}
