'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Node, Edge } from '@xyflow/react'
import { CustomNodeData, NodeType, useFlowStore } from './store'

// Per-user localStorage isolation
let _uid: string = typeof window !== 'undefined'
  ? (localStorage.getItem('ai-canvas-uid') ?? 'anon')
  : 'anon'

const userStorage = {
  getItem: (_name: string): unknown => {
    if (typeof window === 'undefined') return null
    const raw = localStorage.getItem(`ai-canvas-projects-${_uid}`)
    if (!raw) return null
    try { return JSON.parse(raw) } catch { return null }
  },
  setItem: (_name: string, value: unknown): void => {
    if (typeof window === 'undefined') return
    localStorage.setItem(`ai-canvas-projects-${_uid}`, JSON.stringify(value))
  },
  removeItem: (_name: string): void => {
    if (typeof window === 'undefined') return
    localStorage.removeItem(`ai-canvas-projects-${_uid}`)
  },
}

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
}

interface ProjectState {
  projects: Project[]
  activeProjectId: string | null
  sidebarCollapsed: boolean

  toggleSidebar: () => void
  createProject: (name?: string) => string
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
  switchProject: (id: string) => void
  saveCurrentProject: () => void
  duplicateProject: (id: string) => void
}

const genId = () => `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      sidebarCollapsed: false,

      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),

      createProject: (name) => {
        get().saveCurrentProject()
        const id = genId()
        const project: Project = {
          id,
          name: name || `项目 ${get().projects.length + 1}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          snapshot: null,
        }
        set({
          projects: [project, ...get().projects],
          activeProjectId: id,
        })
        const flow = useFlowStore.getState()
        flow.resetCanvas()
        return id
      },

      renameProject: (id, name) => {
        set({
          projects: get().projects.map((p) =>
            p.id === id ? { ...p, name, updatedAt: Date.now() } : p
          ),
        })
      },

      deleteProject: (id) => {
        const { projects, activeProjectId } = get()
        const remaining = projects.filter((p) => p.id !== id)
        if (id === activeProjectId) {
          if (remaining.length > 0) {
            get().switchProject(remaining[0].id)
          } else {
            set({ projects: remaining, activeProjectId: null })
            useFlowStore.getState().resetCanvas()
          }
        } else {
          set({ projects: remaining })
        }
      },

      switchProject: (id) => {
        if (id === get().activeProjectId) return
        get().saveCurrentProject()
        const project = get().projects.find((p) => p.id === id)
        if (!project) return
        set({ activeProjectId: id })
        const flow = useFlowStore.getState()
        if (project.snapshot) {
          flow.loadCanvas(project.snapshot)
        } else {
          flow.resetCanvas()
        }
      },

      saveCurrentProject: () => {
        const { activeProjectId, projects } = get()
        if (!activeProjectId) return
        const flow = useFlowStore.getState()
        const snapshot = {
          nodes: flow.nodes,
          edges: flow.edges,
          nodeCount: flow.nodeCount,
        }
        set({
          projects: projects.map((p) =>
            p.id === activeProjectId
              ? { ...p, snapshot, updatedAt: Date.now() }
              : p
          ),
        })
      },

      duplicateProject: (id) => {
        const source = get().projects.find((p) => p.id === id)
        if (!source) return
        const newId = genId()
        const copy: Project = {
          ...source,
          id: newId,
          name: `${source.name} (副本)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }
        set({ projects: [copy, ...get().projects] })
      },
    }),
    {
      name: 'ai-canvas-projects',
      storage: userStorage,
      version: 1,
    }
  )
)

export function initStoreForUser(userId: string | null) {
  const newUid = userId ?? 'anon'
  if (newUid === _uid) return
  _uid = newUid
  if (typeof window !== 'undefined') {
    if (userId) localStorage.setItem('ai-canvas-uid', userId)
    else localStorage.removeItem('ai-canvas-uid')
  }
  // Clear in-memory state first so stale data from previous user doesn't linger
  // if the new user has no saved data (rehydrate skips update on null storage)
  useProjectStore.setState({ projects: [], activeProjectId: null })
  useFlowStore.getState().resetCanvas()
  useProjectStore.persist.rehydrate()
  // Load the newly active project's snapshot into the flow canvas
  const { activeProjectId, projects } = useProjectStore.getState()
  const active = projects.find((p) => p.id === activeProjectId)
  if (active?.snapshot) {
    useFlowStore.getState().loadCanvas(active.snapshot)
  }
}
