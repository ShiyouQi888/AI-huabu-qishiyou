import { NextRequest, NextResponse } from 'next/server'
import { verifyUserByLogin, createToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { login, password } = await req.json()
    if (!login || !password) {
      return NextResponse.json({ error: '请输入账号和密码' }, { status: 400 })
    }
    const user = await verifyUserByLogin(login.trim(), password)
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
    return NextResponse.json({ error: e instanceof Error ? e.message : '登录失败' }, { status: 400 })
  }
}
