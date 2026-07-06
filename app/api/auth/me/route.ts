import { NextResponse } from 'next/server'
import { getAuthUser, getUserMeta, updatePassword, updateProfile, setPassword, updateEmail } from '@/lib/auth'
import { verifyCode } from '@/lib/verify-code'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ user: null }, { status: 401 })
  const meta = getUserMeta(user.id)
  return NextResponse.json({
    user,
    hasPassword: meta?.hasPassword ?? false,
    hasGoogle: meta?.hasGoogle ?? false,
  })
}

export async function PUT(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const body = await req.json() as {
      action?: string
      currentPassword?: string
      newPassword?: string
      username?: string
      email?: string
      code?: string
    }
    const { action } = body

    if (action === 'change-password') {
      const { currentPassword, newPassword } = body
      if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: '缺少密码字段' }, { status: 400 })
      }
      await updatePassword(user.id, currentPassword, newPassword)
      return NextResponse.json({ ok: true })
    }

    if (action === 'set-password') {
      const { newPassword } = body
      if (!newPassword) return NextResponse.json({ error: '缺少密码字段' }, { status: 400 })
      await setPassword(user.id, newPassword)
      return NextResponse.json({ ok: true })
    }

    if (action === 'update-profile') {
      const { username } = body
      const updated = await updateProfile(user.id, { username })
      return NextResponse.json({ user: updated })
    }

    if (action === 'update-email') {
      const { email, code } = body
      if (!email || !code) return NextResponse.json({ error: '缺少邮箱或验证码' }, { status: 400 })
      const valid = verifyCode(`change-email:${email}`, code)
      if (!valid) return NextResponse.json({ error: '验证码错误' }, { status: 400 })
      const updated = await updateEmail(user.id, email)
      return NextResponse.json({ user: updated })
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '操作失败' }, { status: 400 })
  }
}
