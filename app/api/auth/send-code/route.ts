import { NextRequest, NextResponse } from 'next/server'
import { genCode, storeCode } from '@/lib/verify-code'
import { sendVerifyCode } from '@/lib/email'
import { getUserByEmail, getAuthUser } from '@/lib/auth'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Purpose = 'register' | 'change-email' | 'reset-password'

export async function POST(req: NextRequest) {
  try {
    const { email, purpose = 'register' } = await req.json() as {
      email?: string
      purpose?: Purpose
    }

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
    }

    const existing = getUserByEmail(email)

    if (purpose === 'register') {
      if (existing) return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 })
    } else if (purpose === 'change-email') {
      const authUser = await getAuthUser()
      if (!authUser) return NextResponse.json({ error: '未登录' }, { status: 401 })
      if (existing && existing.id !== authUser.id) {
        return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 400 })
      }
    } else if (purpose === 'reset-password') {
      if (!existing) return NextResponse.json({ error: '该邮箱未注册' }, { status: 400 })
    }

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return NextResponse.json({ error: '服务器邮件服务未配置，请联系管理员' }, { status: 503 })
    }

    const code = genCode()
    storeCode(`${purpose}:${email}`, code)
    await sendVerifyCode(email, code)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '发送失败' }, { status: 400 })
  }
}
