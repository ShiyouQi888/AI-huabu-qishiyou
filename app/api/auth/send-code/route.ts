import { NextRequest, NextResponse } from 'next/server'
import { genCode, storeCode } from '@/lib/verify-code'
import { sendVerifyCode } from '@/lib/email'
import { getUserByEmail, getAuthUser } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Purpose = 'register' | 'change-email' | 'reset-password'

export async function POST(req: NextRequest) {
  try {
    const { email, purpose = 'register' } = await req.json() as {
      email?: string
      purpose?: Purpose
    }

    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
    }

    if (!['register', 'change-email', 'reset-password'].includes(purpose)) {
      return NextResponse.json({ error: '验证码用途不正确' }, { status: 400 })
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'
    const ipLimit = rateLimit(clientIp, 'send-verification-code', { limit: 10, windowMs: 15 * 60_000 })
    const emailLimit = rateLimit(normalizedEmail, 'send-verification-code', { limit: 5, windowMs: 15 * 60_000 })
    if (!ipLimit.ok || !emailLimit.ok) {
      const retryAfter = Math.max(ipLimit.retryAfter, emailLimit.retryAfter)
      return NextResponse.json(
        { error: `请求过于频繁，请 ${retryAfter} 秒后重试` },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      )
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: '服务器邮件服务未配置，请联系管理员' }, { status: 503 })
    }

    const existing = getUserByEmail(normalizedEmail)

    if (purpose === 'register') {
      if (existing) return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 })
    } else if (purpose === 'change-email') {
      const authUser = await getAuthUser()
      if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 })
      if (existing && existing.id !== authUser.id) {
        return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 400 })
      }
    } else if (purpose === 'reset-password') {
      // Keep account membership private while preserving the same UI flow.
      if (!existing) return NextResponse.json({ ok: true })
    }

    const code = genCode()
    storeCode(`${purpose}:${normalizedEmail}`, code)
    await sendVerifyCode(normalizedEmail, code, purpose)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '发送失败' }, { status: 400 })
  }
}
