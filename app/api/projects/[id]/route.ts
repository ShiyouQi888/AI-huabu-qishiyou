/**
 * GET    /api/projects/[id]  — 获取单个项目
 * PUT    /api/projects/[id]  — 更新项目（名称、描述、快照）
 * DELETE /api/projects/[id]  — 删除项目
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

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { id } = await params
  const projects = await loadProjects(user.id)
  const project = projects.find((p) => p.id === id)
  if (!project) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

  return NextResponse.json(project)
}

export async function PUT(req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { id } = await params
  const projects = await loadProjects(user.id)
  const idx = projects.findIndex((p) => p.id === id)
  if (idx === -1) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

  try {
    const body = await req.json() as Partial<Project>
    const existing = projects[idx]
    const updated: Project = {
      ...existing,
      name: body.name ?? existing.name,
      description: body.description ?? existing.description,
      snapshot: body.snapshot !== undefined ? body.snapshot : existing.snapshot,
      updatedAt: Date.now(),
    }
    projects[idx] = updated
    await saveProjects(user.id, projects)
    return NextResponse.json(updated)
  } catch (e) {
    console.error('Project update error:', e)
    return NextResponse.json({ error: '更新失败' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: RouteContext) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 })

  const { id } = await params
  const projects = await loadProjects(user.id)
  const idx = projects.findIndex((p) => p.id === id)
  if (idx === -1) return NextResponse.json({ error: '项目不存在' }, { status: 404 })

  projects.splice(idx, 1)
  await saveProjects(user.id, projects)
  return NextResponse.json({ ok: true })
}
