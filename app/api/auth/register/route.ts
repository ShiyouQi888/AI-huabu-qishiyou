import { NextRequest, NextResponse } from 'next/server'
import { createUser, createToken } from '@/lib/auth'
import { verifyCode } from '@/lib/verify-code'

export async function POST(req: NextRequest) {
  try {
    const { username, password, email, code } = await req.json() as {
      username?: string
      password?: string
      email?: string
      code?: string
    }

    if (!username || !password) {
      return NextResponse.json({ error: '请输入用户名和密码' }, { status: 400 })
    }
    if (username.length < 2 || username.length > 20) {
      return NextResponse.json({ error: '用户名长度需要 2-20 个字符' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少 6 个字符' }, { status: 400 })
    }

    // Email verification — required only when SMTP is configured
    const smtpConfigured = !!(process.env.SMTP_USER && process.env.SMTP_PASS)
    if (smtpConfigured) {
      if (!email) return NextResponse.json({ error: '请填写邮箱' }, { status: 400 })
      if (!code)  return NextResponse.json({ error: '请输入验证码' }, { status: 400 })
      const valid = verifyCode(`register:${email}`, code)   // throws if expired / too many attempts
      if (!valid) return NextResponse.json({ error: '验证码错误' }, { status: 400 })
    }

    const user = await createUser(username, password, smtpConfigured ? email : undefined)
    const token = createToken(user)
    const res = NextResponse.json({ user })
    res.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })
    return res
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '注册失败' }, { status: 400 })
  }
}
