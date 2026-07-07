/**
 * GET    /api/projects/[id]?scope=…  — 单个项目（含完整快照，成员可读）
 * PUT    /api/projects/[id]           — 更新（团队项目仅 editors 内成员可写）
 * DELETE /api/projects/[id]?scope=…   — 删除（同上）
 */

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { resolveScopeStoreId, TeamError } from '@/lib/teams'
import { loadProjects, saveProjects, assertCanEdit, canEditProject, type Project } from '@/lib/project-access'

function scopeErr(e: unknown) {
  if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.statusCode })
  console.error('Project route error:', e)
  return NextResponse.json({ error: '操作失败' }, { status: 500 })
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    const scope = new URL(request.url).searchParams.get('scope')
    const storeId = await resolveScopeStoreId(user.id, scope)
    const projects = await loadProjects(storeId)
    const project = projects.find((p) => p.id === id)
    if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 })
    return NextResponse.json({ ...project, canEdit: canEditProject(storeId, user.id, project) })
  } catch (e) {
    return scopeErr(e)
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    const body = (await req.json()) as Partial<Project> & { scope?: string }
    const storeId = await resolveScopeStoreId(user.id, body.scope)
    const projects = await loadProjects(storeId)
    const idx = projects.findIndex((p) => p.id === id)
    if (idx === -1) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

    const existing = projects[idx]
    assertCanEdit(storeId, user.id, existing)

    const updated: Project = {
      ...existing,
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      snapshot: body.snapshot !== undefined ? body.snapshot : existing.snapshot,
      updatedAt: Date.now(),
      updatedBy: user.id,
    }
    projects[idx] = updated
    await saveProjects(storeId, projects)
    return NextResponse.json(updated)
  } catch (e) {
    return scopeErr(e)
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })
  try {
    const { id } = await params
    const scope = new URL(request.url).searchParams.get('scope')
    const storeId = await resolveScopeStoreId(user.id, scope)
    const projects = await loadProjects(storeId)
    const idx = projects.findIndex((p) => p.id === id)
    if (idx === -1) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

    assertCanEdit(storeId, user.id, projects[idx])
    projects.splice(idx, 1)
    await saveProjects(storeId, projects)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return scopeErr(e)
  }
}
