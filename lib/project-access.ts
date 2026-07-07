/**
 * Shared server-side project storage + edit-permission logic.
 * Used by the /api/projects routes. File-backed under data/projects/{storeId}.json
 * where storeId is a userId (personal) or teamId (team).
 */

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { TeamError } from './teams'

const PROJECTS_DIR = path.join(process.cwd(), 'data', 'projects')

export interface ProjectSnapshot {
  nodes: unknown[]
  edges: unknown[]
  nodeCount: Record<string, number>
}

export interface Project {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  snapshot: ProjectSnapshot | null
  createdBy?: string     // creator (attribution)
  editors?: string[]     // team projects: userIds allowed to edit (defaults to [creator])
  updatedBy?: string
}

async function storeFile(storeId: string): Promise<string> {
  await mkdir(PROJECTS_DIR, { recursive: true })
  return path.join(PROJECTS_DIR, `${storeId}.json`)
}

export async function loadProjects(storeId: string): Promise<Project[]> {
  try {
    const file = await storeFile(storeId)
    if (!existsSync(file)) return []
    return JSON.parse(await readFile(file, 'utf-8')) as Project[]
  } catch {
    return []
  }
}

export async function saveProjects(storeId: string, projects: Project[]): Promise<void> {
  await writeFile(await storeFile(storeId), JSON.stringify(projects, null, 2))
}

/** The set of editors for a team project (legacy records fall back to their creator). */
export function editorsOf(p: Pick<Project, 'editors' | 'createdBy'>): string[] {
  if (p.editors && p.editors.length) return p.editors
  return p.createdBy ? [p.createdBy] : []
}

export function canEditProject(storeId: string, userId: string, p: Pick<Project, 'editors' | 'createdBy'>): boolean {
  if (storeId === userId) return true                 // personal store — always editable
  const eds = editorsOf(p)
  return eds.length === 0 || eds.includes(userId)      // no editors recorded → editable (legacy)
}

export function assertCanEdit(storeId: string, userId: string, p: Pick<Project, 'editors' | 'createdBy'>): void {
  if (!canEditProject(storeId, userId, p)) {
    throw new TeamError('只读：你不是该团队项目的可编辑成员', 403)
  }
}

/** Lightweight list item — no snapshot payload, just enough for the sidebar. */
export function toListItem(p: Project) {
  return {
    id: p.id,
    name: p.name,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    createdBy: p.createdBy,
    editors: p.editors,
    nodeCount: p.snapshot?.nodes?.length ?? 0,
    snapshot: null,
  }
}
