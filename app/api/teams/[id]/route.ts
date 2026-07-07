/**
 * GET    /api/teams/[id]  — 团队详情（成员可见）
 * PATCH  /api/teams/[id]  — 重命名 { name }（拥有者/管理员）
 * DELETE /api/teams/[id]  — 解散团队（仅拥有者）
 */

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getTeamForUser, renameTeam, deleteTeam, teamErrorResponse } from '@/lib/teams'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    const team = await getTeamForUser(id, user.id)
    return NextResponse.json(team)
  } catch (e) {
    return teamErrorResponse(e)
  }
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    const { name } = (await req.json()) as { name?: string }
    const team = await renameTeam(id, user.id, name ?? '')
    return NextResponse.json(team)
  } catch (e) {
    return teamErrorResponse(e)
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    await deleteTeam(id, user.id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return teamErrorResponse(e)
  }
}
