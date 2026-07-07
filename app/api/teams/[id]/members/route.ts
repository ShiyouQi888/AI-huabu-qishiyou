/**
 * POST   /api/teams/[id]/members  — 按用户名邀请成员 { username, role? }（拥有者/管理员）
 * PATCH  /api/teams/[id]/members  — 调整成员角色 { userId, role }（仅拥有者）
 * DELETE /api/teams/[id]/members?userId=xxx  — 移除成员 / 退出团队（自己）
 */

import { NextResponse } from 'next/server'
import { getAuthUser, getUserByUsername } from '@/lib/auth'
import { addMember, updateMemberRole, removeMember, teamErrorResponse, type TeamRole } from '@/lib/teams'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    const { username, role } = (await req.json()) as { username?: string; role?: TeamRole }
    if (!username || !username.trim()) return NextResponse.json({ error: '请填写用户名' }, { status: 400 })

    const target = getUserByUsername(username)
    if (!target) return NextResponse.json({ error: `用户「${username}」不存在` }, { status: 404 })

    const team = await addMember(id, user.id, { id: target.id, username: target.username }, role ?? 'member')
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
    const { userId, role } = (await req.json()) as { userId?: string; role?: TeamRole }
    if (!userId || !role) return NextResponse.json({ error: '缺少参数' }, { status: 400 })
    const team = await updateMemberRole(id, user.id, userId, role)
    return NextResponse.json(team)
  } catch (e) {
    return teamErrorResponse(e)
  }
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    const targetUserId = new URL(req.url).searchParams.get('userId') || user.id
    const team = await removeMember(id, user.id, targetUserId)
    return NextResponse.json(team)
  } catch (e) {
    return teamErrorResponse(e)
  }
}
