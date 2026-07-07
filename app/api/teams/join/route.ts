/**
 * POST /api/teams/join  — 通过邀请码加入团队 { code }
 */

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { joinByCode, teamErrorResponse } from '@/lib/teams'

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { code } = (await req.json()) as { code?: string }
    if (!code || !code.trim()) return NextResponse.json({ error: '请填写邀请码' }, { status: 400 })
    const team = await joinByCode(code, { id: user.id, username: user.username })
    return NextResponse.json(team)
  } catch (e) {
    return teamErrorResponse(e)
  }
}
