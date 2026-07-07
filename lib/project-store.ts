'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Node, Edge } from '@xyflow/react'
import { CustomNodeData, NodeType, useFlowStore } from './store'

export interface Project {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  snapshot: {
    nodes: Node<CustomNodeData>[]
    edges: Edge[]
    nodeCount: Record<NodeType, number>
  } | null
  /** Team projects: creator (attribution) + the userIds allowed to edit. */
  createdBy?: string
  editors?: string[]
  /** Node count for list display (snapshots are lazy-loaded, so the list carries just this). */
  nodeCount?: number
}

interface TeamRef { id: string; name: string }

interface ProjectState {
  scope: string                 // 'personal' | teamId
  userId: string | null
  teams: TeamRef[]
  projects: Project[]
  activeProjectId: string | null
  activeCanEdit: boolean
  loading: boolean
  sidebarCollapsed: boolean

  toggleSidebar: () => void
  setScope: (scope: string) => Promise<void>
  reload: () => Promise<void>
  createProject: (name?: string) => Promise<string | undefined>
  renameProject: (id: string, name: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  switchProject: (id: string) => Promise<void>
  saveCurrentProject: (keepalive?: boolean) => Promise<void>
  duplicateProject: (id: string) => Promise<void>
  convertToTeamProject: (id: string, teamId: string) => Promise<void>
  updateProjectEditors: (id: string, action: 'transfer' | 'add' | 'remove', userId: string) => Promise<void>
}

const flowSnapshot = () => {
  const f = useFlowStore.getState()
  return { nodes: f.nodes, edges: f.edges, nodeCount: f.nodeCount }
}

export const editorsOf = (p: Pick<Project, 'editors' | 'createdBy'>): string[] =>
  p.editors?.length ? p.editors : (p.createdBy ? [p.createdBy] : [])

const projectCanEdit = (p: Pick<Project, 'editors' | 'createdBy'>, scope: string, userId: string | null): boolean => {
  if (scope === 'personal') return true
  const eds = editorsOf(p)
  return eds.length === 0 || (!!userId && eds.includes(userId))
}

async function apiList(scope: string): Promise<{ projects: Project[]; userId: string }> {
  try {
    const res = await fetch(`/api/projects?scope=${encodeURIComponent(scope)}`)
    if (!res.ok) return { projects: [], userId: '' }
    return (await res.json()) as { projects: Project[]; userId: string }
  } catch {
    return { projects: [], userId: '' }
  }
}

/** Fetch a single project with its full snapshot (lazy-loaded on open). */
async function fetchFull(id: string, scope: string): Promise<(Project & { canEdit?: boolean }) | null> {
  try {
    const res = await fetch(`/api/projects/${id}?scope=${encodeURIComponent(scope)}`)
    if (!res.ok) return null
    return (await res.json()) as Project & { canEdit?: boolean }
  } catch {
    return null
  }
}

/** One-time migration of legacy localStorage projects → server. Keeps local as backup. */
async function migrateLegacy(userId: string) {
  if (typeof window === 'undefined') return
  const flag = `ai-canvas-migrated-${userId}`
  try {
    if (localStorage.getItem(flag)) return
    const raw = localStorage.getItem(`ai-canvas-projects-${userId}`)
    if (!raw) { localStorage.setItem(flag, '1'); return }
    const parsed = JSON.parse(raw)
    const legacy: Project[] = parsed?.state?.projects ?? parsed?.projects ?? []
    let allOk = true
    for (const p of legacy) {
      if (!p?.id) continue
      try {
        // upsert by id → idempotent if this re-runs
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: p.id, name: p.name, snapshot: p.snapshot ?? null, createdAt: p.createdAt, scope: 'personal' }),
        })
        if (!res.ok) allOk = false
      } catch { allOk = false }
    }
    // only mark done once everything landed; legacy data is kept as a backup either way
    if (allOk) localStorage.setItem(flag, '1')
  } catch {
    /* leave unmarked so it retries on next load — no data lost */
  }
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      scope: 'personal',
      userId: null,
      teams: [],
      projects: [],
      activeProjectId: null,
      activeCanEdit: true,
      loading: false,
      sidebarCollapsed: false,

      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

      reload: async () => {
        set({ loading: true })
        const { projects } = await apiList(get().scope)
        set({ projects, loading: false })
      },

      setScope: async (scope) => {
        if (scope === get().scope) return
        await get().saveCurrentProject()
        set({ scope, activeProjectId: null, activeCanEdit: true, projects: [], loading: true })
        useFlowStore.getState().resetCanvas()
        const { projects } = await apiList(scope)
        set({ projects, loading: false })
      },

      createProject: async (name) => {
        await get().saveCurrentProject()
        const scope = get().scope
        try {
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name || `项目 ${get().projects.length + 1}`, snapshot: null, scope }),
          })
          if (!res.ok) return undefined
          const project = (await res.json()) as Project
          set({ projects: [project, ...get().projects], activeProjectId: project.id, activeCanEdit: true })
          useFlowStore.getState().resetCanvas()
          return project.id
        } catch { return undefined }
      },

      renameProject: async (id, name) => {
        set({ projects: get().projects.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p)) })
        await fetch(`/api/projects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, scope: get().scope }),
        }).catch(() => {})
      },

      deleteProject: async (id) => {
        const { scope, activeProjectId, projects } = get()
        const remaining = projects.filter((p) => p.id !== id)
        set({ projects: remaining })
        await fetch(`/api/projects/${id}?scope=${encodeURIComponent(scope)}`, { method: 'DELETE' }).catch(() => {})
        if (id === activeProjectId) {
          if (remaining.length > 0) await get().switchProject(remaining[0].id)
          else { set({ activeProjectId: null, activeCanEdit: true }); useFlowStore.getState().resetCanvas() }
        }
      },

      switchProject: async (id) => {
        if (id === get().activeProjectId) return
        await get().saveCurrentProject()
        const { scope, projects } = get()
        if (!projects.some((p) => p.id === id)) return
        set({ activeProjectId: id, activeCanEdit: true })
        const full = await fetchFull(id, scope)
        if (!full) { useFlowStore.getState().resetCanvas(); set({ activeCanEdit: false }); return }
        set({
          activeCanEdit: full.canEdit !== false,
          projects: get().projects.map((p) =>
            p.id === id ? { ...p, snapshot: full.snapshot ?? null, editors: full.editors, createdBy: full.createdBy } : p),
        })
        if (full.snapshot) useFlowStore.getState().loadCanvas(full.snapshot)
        else useFlowStore.getState().resetCanvas()
      },

      saveCurrentProject: async (keepalive = false) => {
        const { activeProjectId, activeCanEdit, scope } = get()
        if (!activeProjectId || !activeCanEdit) return
        const snapshot = flowSnapshot()
        try {
          await fetch(`/api/projects/${activeProjectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ snapshot, scope }),
            keepalive,
          })
        } catch { /* best effort */ }
        set({ projects: get().projects.map((p) => (p.id === activeProjectId ? { ...p, snapshot, updatedAt: Date.now() } : p)) })
      },

      duplicateProject: async (id) => {
        const src = get().projects.find((p) => p.id === id)
        if (!src) return
        const scope = get().scope
        const snapshot = id === get().activeProjectId ? flowSnapshot() : ((await fetchFull(id, scope))?.snapshot ?? null)
        try {
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: `${src.name} (副本)`, snapshot, scope }),
          })
          if (res.ok) set({ projects: [(await res.json()) as Project, ...get().projects] })
        } catch { /* ignore */ }
      },

      convertToTeamProject: async (id, teamId) => {
        const src = get().projects.find((p) => p.id === id)
        if (!src) return
        const snapshot = id === get().activeProjectId ? flowSnapshot() : ((await fetchFull(id, get().scope))?.snapshot ?? null)
        try {
          // 1. create a copy in the team scope
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: src.name, snapshot, scope: teamId }),
          })
          if (!res.ok) return
          // 2. remove the personal original (move)
          await fetch(`/api/projects/${id}?scope=personal`, { method: 'DELETE' }).catch(() => {})
          set({ projects: get().projects.filter((p) => p.id !== id) })
          if (get().activeProjectId === id) {
            set({ activeProjectId: null, activeCanEdit: true })
            useFlowStore.getState().resetCanvas()
          }
        } catch { /* ignore */ }
      },

      updateProjectEditors: async (id, action, userId) => {
        const scope = get().scope
        try {
          const res = await fetch(`/api/projects/${id}/editors`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope, action, userId }),
          })
          if (!res.ok) return
          const data = (await res.json()) as Project & { canEdit?: boolean }
          set({
            projects: get().projects.map((p) => (p.id === id ? { ...p, editors: data.editors, createdBy: data.createdBy } : p)),
          })
          if (get().activeProjectId === id) set({ activeCanEdit: data.canEdit !== false })
        } catch { /* ignore */ }
      },
    }),
    {
      name: 'ai-canvas-ui',
      version: 2,
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
)

/** Called on login/logout: migrate legacy local projects, then load from the server. */
export async function initStoreForUser(userId: string | null) {
  if (!userId) {
    useProjectStore.setState({
      userId: null, scope: 'personal', projects: [], teams: [],
      activeProjectId: null, activeCanEdit: true, loading: false,
    })
    useFlowStore.getState().resetCanvas()
    return
  }
  if (userId === useProjectStore.getState().userId) return

  useProjectStore.setState({
    userId, scope: 'personal', projects: [], activeProjectId: null, activeCanEdit: true, loading: true,
  })
  useFlowStore.getState().resetCanvas()

  await migrateLegacy(userId)

  const teams = await fetch('/api/teams')
    .then((r) => (r.ok ? r.json() : { teams: [] }))
    .then((d) => (d.teams ?? []) as TeamRef[])
    .catch(() => [] as TeamRef[])

  const { projects } = await apiList('personal')
  useProjectStore.setState({ teams, projects, loading: false })

  if (projects.length > 0) await useProjectStore.getState().switchProject(projects[0].id)
}
