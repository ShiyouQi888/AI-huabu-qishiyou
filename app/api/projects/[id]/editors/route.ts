/**
 * PATCH /api/projects/[id]/editors  — 管理团队项目的可编辑成员
 * body: { scope: teamId, action: 'transfer' | 'add' | 'remove', userId }
 *   transfer → 编辑权唯一转让给 userId（editors = [userId]）
 *   add      → 新增 userId 为可编辑成员（多人编辑）
 *   remove   → 移除 userId 的编辑权（至少保留一名）
 * 仅当前可编辑成员可操作；目标必须是团队成员。
 */

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { resolveScopeStoreId, userInTeam, TeamError } from '@/lib/teams'
import { loadProjects, saveProjects, editorsOf, canEditProject } from '@/lib/project-access'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const { id } = await params
    const body = (await req.json()) as { scope?: string; action?: 'transfer' | 'add' | 'remove'; userId?: string }

    if (!body.scope || body.scope === 'personal') {
      return NextResponse.json({ error: '个人项目无需管理编辑权限' }, { status: 400 })
    }
    if (!body.userId || !body.action) {
      return NextResponse.json({ error: '缺少 userId / action' }, { status: 400 })
    }

    const storeId = await resolveScopeStoreId(user.id, body.scope) // validates caller membership
    const projects = await loadProjects(storeId)
    const idx = projects.findIndex((p) => p.id === id)
    if (idx === -1) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

    const project = projects[idx]
    if (!canEditProject(storeId, user.id, project)) {
      throw new TeamError('只有可编辑成员可管理编辑权限', 403)
    }

    // Target must be a member of the same team
    if (!(await userInTeam(storeId, body.userId))) {
      throw new TeamError('目标用户不是团队成员', 400)
    }

    let editors = editorsOf(project)
    if (body.action === 'transfer') {
      editors = [body.userId]
    } else if (body.action === 'add') {
      editors = Array.from(new Set([...editors, body.userId]))
    } else if (body.action === 'remove') {
      editors = editors.filter((u) => u !== body.userId)
      if (editors.length === 0) throw new TeamError('团队项目至少需要保留一名可编辑成员', 400)
    }

    project.editors = editors
    project.updatedAt = Date.now()
    projects[idx] = project
    await saveProjects(storeId, projects)

    return NextResponse.json({ ...project, canEdit: canEditProject(storeId, user.id, project) })
  } catch (e) {
    if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.statusCode })
    console.error('Editors route error:', e)
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}
