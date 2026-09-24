import { NextRequest, NextResponse } from 'next/server'
import { resetPasswordByEmail } from '@/lib/auth'
import { verifyCode } from '@/lib/verify-code'
import { rateLimit } from '@/lib/rate-limit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json() as {
      email?: string
      code?: string
      newPassword?: string
    }
    const normalizedEmail = email?.trim().toLowerCase()
    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail) || !code || !newPassword) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: '验证码格式不正确' }, { status: 400 })
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: '密码至少 6 个字符' }, { status: 400 })
    }

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown'
    const attemptLimit = rateLimit(`${clientIp}:${normalizedEmail}`, 'reset-password', {
      limit: 10,
      windowMs: 15 * 60_000,
    })
    if (!attemptLimit.ok) {
      return NextResponse.json(
        { error: `尝试次数过多，请 ${attemptLimit.retryAfter} 秒后重试` },
        { status: 429, headers: { 'Retry-After': String(attemptLimit.retryAfter) } },
      )
    }

    const valid = verifyCode(`reset-password:${normalizedEmail}`, code)
    if (!valid) return NextResponse.json({ error: '验证码错误' }, { status: 400 })
    await resetPasswordByEmail(normalizedEmail, newPassword)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '操作失败' }, { status: 400 })
  }
}
