/**
 * GET  /api/projects?scope=personal|team-xxx  — 该作用域下的项目列表（轻量，不含快照）
 * POST /api/projects                           — 创建或同步项目（body.scope 决定归属）
 *
 * 作用域：personal → data/projects/{userId}.json；team-xxx → data/projects/{teamId}.json（需成员）。
 * 团队项目为「可编辑成员」模式：仅 editors 内成员可写入，其余成员只读（默认 editors=[创建者]）。
 */

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { resolveScopeStoreId, TeamError } from '@/lib/teams'
import { loadProjects, saveProjects, assertCanEdit, toListItem, type Project } from '@/lib/project-access'

function scopeErr(e: unknown) {
  if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.statusCode })
  console.error('Project route error:', e)
  return NextResponse.json({ error: '操作失败' }, { status: 500 })
}

export async function GET(request: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const scope = new URL(request.url).searchParams.get('scope')
    const storeId = await resolveScopeStoreId(user.id, scope)
    const projects = await loadProjects(storeId)
    projects.sort((a, b) => b.updatedAt - a.updatedAt)
    // Lazy-load: omit snapshots from the list; the canvas fetches one on open.
    return NextResponse.json({ projects: projects.map(toListItem), userId: user.id })
  } catch (e) {
    return scopeErr(e)
  }
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const body = (await req.json()) as Partial<Project> & { scope?: string }
    const storeId = await resolveScopeStoreId(user.id, body.scope)
    const isTeam = storeId !== user.id
    const projects = await loadProjects(storeId)
    const now = Date.now()

    // Upsert when an id is provided
    if (body.id) {
      const idx = projects.findIndex((p) => p.id === body.id)
      const existing = idx >= 0 ? projects[idx] : null
      if (existing) assertCanEdit(storeId, user.id, existing)

      const project: Project = {
        id: body.id,
        name: body.name ?? existing?.name ?? `项目 ${projects.length + 1}`,
        description: body.description ?? existing?.description ?? '',
        createdAt: existing?.createdAt ?? body.createdAt ?? now,
        updatedAt: now,
        snapshot: body.snapshot !== undefined ? body.snapshot : (existing?.snapshot ?? null),
        createdBy: existing?.createdBy ?? (isTeam ? user.id : undefined),
        editors: existing?.editors ?? (isTeam ? [user.id] : undefined),
        updatedBy: user.id,
      }
      if (idx >= 0) projects[idx] = project
      else projects.unshift(project)
      await saveProjects(storeId, projects)
      return NextResponse.json(project, { status: idx >= 0 ? 200 : 201 })
    }

    // Create new
    const project: Project = {
      id: `proj-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: body.name || `项目 ${projects.length + 1}`,
      description: body.description || '',
      createdAt: now,
      updatedAt: now,
      snapshot: body.snapshot ?? null,
      createdBy: isTeam ? user.id : undefined,
      editors: isTeam ? [user.id] : undefined,
      updatedBy: user.id,
    }
    projects.unshift(project)
    await saveProjects(storeId, projects)
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    return scopeErr(e)
  }
}
