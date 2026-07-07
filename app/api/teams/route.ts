/**
 * GET  /api/teams  — 当前用户所属的团队列表（含调用者 userId 供前端判定角色）
 * POST /api/teams  — 创建团队 { name }
 */

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getTeamsForUser, createTeam, teamErrorResponse } from '@/lib/teams'

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const teams = await getTeamsForUser(user.id)
  return NextResponse.json({ teams, userId: user.id })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const { name } = (await req.json()) as { name?: string }
    if (!name || !name.trim()) return NextResponse.json({ error: '请填写团队名称' }, { status: 400 })
    const team = await createTeam({ id: user.id, username: user.username }, name)
    return NextResponse.json(team, { status: 201 })
  } catch (e) {
    return teamErrorResponse(e)
  }
}
