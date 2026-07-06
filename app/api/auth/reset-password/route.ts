import { NextRequest, NextResponse } from 'next/server'
import { resetPasswordByEmail } from '@/lib/auth'
import { verifyCode } from '@/lib/verify-code'

export async function POST(req: NextRequest) {
  try {
    const { email, code, newPassword } = await req.json() as {
      email?: string
      code?: string
      newPassword?: string
    }
    if (!email || !code || !newPassword) {
      return NextResponse.json({ error: '参数不完整' }, { status: 400 })
    }
    const valid = verifyCode(`reset-password:${email}`, code)
    if (!valid) return NextResponse.json({ error: '验证码错误' }, { status: 400 })
    await resetPasswordByEmail(email, newPassword)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '操作失败' }, { status: 400 })
  }
}
