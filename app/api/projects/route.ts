/**
 * GET  /api/projects        — 获取当前用户的所有项目（按 updatedAt 降序）
 * POST /api/projects        — 创建或同步项目（body 可含 id，用于前端 upsert）
 */

import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { getAuthUser } from '@/lib/auth'

const PROJECTS_DIR = path.join(process.cwd(), 'data', 'projects')

interface ProjectSnapshot {
  nodes: unknown[]
  edges: unknown[]
  nodeCount: Record<string, number>
}

interface Project {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  snapshot: ProjectSnapshot | null
}

async function userProjectsFile(userId: string): Promise<string> {
  await mkdir(PROJECTS_DIR, { recursive: true })
  return path.join(PROJECTS_DIR, `${userId}.json`)
}

async function loadProjects(userId: string): Promise<Project[]> {
  try {
    const file = await userProjectsFile(userId)
    if (!existsSync(file)) return []
    return JSON.parse(await readFile(file, 'utf-8')) as Project[]
  } catch {
    return []
  }
}

async function saveProjects(userId: string, projects: Project[]): Promise<void> {
  const file = await userProjectsFile(userId)
  await writeFile(file, JSON.stringify(projects, null, 2))
}

export async function GET() {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const projects = await loadProjects(user.id)
  // Sort by updatedAt descending
  projects.sort((a, b) => b.updatedAt - a.updatedAt)
  return NextResponse.json({ projects })
}

export async function POST(req: Request) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  try {
    const body = await req.json() as Partial<Project>
    const projects = await loadProjects(user.id)
    const now = Date.now()

    // If id provided, upsert (overwrite existing or insert new)
    if (body.id) {
      const idx = projects.findIndex((p) => p.id === body.id)
      const existing = idx >= 0 ? projects[idx] : null
      const project: Project = {
        id: body.id,
        name: body.name ?? existing?.name ?? `项目 ${projects.length + 1}`,
        description: body.description ?? existing?.description ?? '',
        createdAt: existing?.createdAt ?? body.createdAt ?? now,
        updatedAt: now,
        snapshot: body.snapshot !== undefined ? body.snapshot : (existing?.snapshot ?? null),
      }
      if (idx >= 0) {
        projects[idx] = project
      } else {
        projects.unshift(project)
      }
      await saveProjects(user.id, projects)
      return NextResponse.json(project, { status: idx >= 0 ? 200 : 201 })
    }

    // No id → create new
    const project: Project = {
      id: `proj-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: body.name || `项目 ${projects.length + 1}`,
      description: body.description || '',
      createdAt: now,
      updatedAt: now,
      snapshot: body.snapshot ?? null,
    }
    projects.unshift(project)
    await saveProjects(user.id, projects)
    return NextResponse.json(project, { status: 201 })
  } catch (e) {
    console.error('Project create/sync error:', e)
    return NextResponse.json({ error: '操作失败' }, { status: 500 })
  }
}
