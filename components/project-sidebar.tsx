'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  FolderOpen,
  Check,
  X,
  LogOut,
  Calendar,
  Mail,
  User,
  Users,
  Share2,
  Lock,
  AlertCircle,
  Cloud,
  Loader2,
  Save,
  Settings,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProjectStore, Project, initStoreForUser } from '@/lib/project-store'
import { useFlowStore } from '@/lib/store'

export function ProjectSidebar() {
  const {
    projects,
    activeProjectId,
    sidebarCollapsed,
    scope,
    teams,
    userId,
    loading,
    saveStatus,
    hasUnsavedChanges,
    lastSavedAt,
    saveError,
    toggleSidebar,
    markDirty,
    setScope,
    createProject,
    renameProject,
    deleteProject,
    switchProject,
    duplicateProject,
    convertToTeamProject,
    updateProjectEditors,
    saveCurrentProject,
  } = useProjectStore()

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [convertPickId, setConvertPickId] = useState<string | null>(null)
  const [editorsPickId, setEditorsPickId] = useState<string | null>(null)
  const [teamMembers, setTeamMembers] = useState<{ userId: string; username: string; role: string }[]>([])

  const isTeamScope = scope !== 'personal'

  const openEditorsPicker = useCallback(async (projectId: string) => {
    setEditorsPickId(projectId)
    setConvertPickId(null)
    try {
      const res = await fetch(`/api/teams/${scope}`)
      if (res.ok) {
        const t = await res.json()
        setTeamMembers(t.members ?? [])
      }
    } catch { /* keep whatever we have */ }
  }, [scope])
  const renameRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<number | null>(null)

  // Focus rename input
  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renamingId])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null)
        setConvertPickId(null)
        setEditorsPickId(null)
      }
    }
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { window.clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [menuOpenId])

  const startRename = useCallback((p: Project) => {
    setRenamingId(p.id)
    setRenameValue(p.name)
    setMenuOpenId(null)
  }, [])

  const commitRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      renameProject(renamingId, renameValue.trim())
    }
    setRenamingId(null)
  }, [renamingId, renameValue, renameProject])

  const handleCreateProject = () => {
    createProject()
  }

  const handleDelete = (id: string) => {
    deleteProject(id)
    setConfirmDeleteId(null)
    setMenuOpenId(null)
  }

  const handleDuplicate = (id: string) => {
    duplicateProject(id)
    setMenuOpenId(null)
  }

  // Track canvas changes and mark the active project dirty.
  useEffect(() => {
    return useFlowStore.subscribe((state, prevState) => {
      if (
        state.nodes !== prevState.nodes ||
        state.edges !== prevState.edges ||
        state.nodeCount !== prevState.nodeCount
      ) {
        markDirty()
      }
    })
  }, [markDirty])

  // Debounced auto-save after edits settle.
  useEffect(() => {
    if (!activeProjectId || !hasUnsavedChanges || saveStatus === 'saving') return
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveCurrentProject()
      saveTimerRef.current = null
    }, 1800)
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [activeProjectId, hasUnsavedChanges, saveCurrentProject, saveStatus])

  // Coarse fallback auto-save on interval.
  useEffect(() => {
    if (!activeProjectId) return
    const timer = setInterval(() => saveCurrentProject(), 30_000)
    return () => clearInterval(timer)
  }, [activeProjectId, saveCurrentProject])

  // Auto-save on beforeunload (keepalive lets the request outlive the page)
  useEffect(() => {
    const handler = () => saveCurrentProject(true)
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saveCurrentProject])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour} 小时前`
    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 7) return `${diffDay} 天前`
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  // Collapsed state
  if (sidebarCollapsed) {
    return (
      <div className="fixed left-3 top-1/2 z-40 -translate-y-1/2">
        <button
          onClick={toggleSidebar}
          className="glass flex size-9 items-center justify-center rounded-xl shadow-lg transition-all hover:bg-muted/60"
          title="展开项目面板"
        >
          <PanelLeftOpen className="size-4 text-muted-foreground" />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed left-0 top-0 z-40 flex h-screen w-[240px] flex-col border-r border-border/40 bg-background/95 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/30 px-3 py-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="size-4 text-primary" />
          <span className="text-[13px] font-semibold">项目</span>
          <span className="rounded-full bg-muted/60 px-1.5 text-[10px] text-muted-foreground">{projects.length}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <SaveStateBadge
            status={saveStatus}
            hasUnsavedChanges={hasUnsavedChanges}
            lastSavedAt={lastSavedAt}
            error={saveError}
            onRetry={() => saveCurrentProject()}
          />
          <button
            onClick={handleCreateProject}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="新建项目"
          >
            <Plus className="size-3.5" />
          </button>
          <button
            onClick={toggleSidebar}
            className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="折叠面板"
          >
            <PanelLeftClose className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Scope: 个人 / 团队 */}
      {teams.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/30 px-2.5 py-2">
          <button
            onClick={() => setScope('personal')}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
              scope === 'personal' ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted/70',
            )}
          >
            <User className="size-3" /> 个人
          </button>
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setScope(t.id)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                scope === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted/70',
              )}
            >
              <Users className="size-3" /> {t.name}
            </button>
          ))}
        </div>
      )}

      {/* New project button */}
      <div className="px-2.5 pt-2.5">
        <button
          onClick={handleCreateProject}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border/50 px-3 py-2.5 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
        >
          <Plus className="size-3.5" />
          {isTeamScope ? '新建团队项目' : '新建项目'}
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto px-2.5 pt-2">
        {loading ? (
          <div className="mt-8 text-center text-[12px] text-muted-foreground/40">加载中…</div>
        ) : projects.length === 0 ? (
          <div className="mt-8 text-center">
            <FolderOpen className="mx-auto size-8 text-muted-foreground/20" />
            <p className="mt-2 text-[12px] text-muted-foreground/40">
              {isTeamScope ? '该团队还没有项目' : '还没有项目'}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/30">点击上方按钮新建</p>
          </div>
        ) : null}

        <div className="space-y-1">
          {projects.map((p) => {
            const isActive = p.id === activeProjectId
            const isRenaming = p.id === renamingId
            const isMenuOpen = p.id === menuOpenId
            const isConfirmingDelete = p.id === confirmDeleteId
            const editors = p.editors?.length ? p.editors : (p.createdBy ? [p.createdBy] : [])
            const canEdit = scope === 'personal' || editors.length === 0 || (!!userId && editors.includes(userId))
            const isConvertPick = p.id === convertPickId
            const isEditorsPick = p.id === editorsPickId
            const nodeN = p.nodeCount ?? p.snapshot?.nodes.length ?? 0

            return (
              <div
                key={p.id}
                className={cn(
                  'group relative rounded-xl px-2.5 py-2 transition-colors cursor-pointer',
                  isActive
                    ? 'bg-primary/10 ring-1 ring-primary/20'
                    : 'hover:bg-muted/40'
                )}
                onClick={() => {
                  if (!isRenaming && !isConfirmingDelete) switchProject(p.id)
                }}
              >
                {/* Name row */}
                <div className="flex items-center gap-1.5">
                  {isRenaming ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename()
                        if (e.key === 'Escape') setRenamingId(null)
                        e.stopPropagation()
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 rounded-md border border-primary/40 bg-background px-1.5 py-0.5 text-[12px] text-foreground outline-none"
                    />
                  ) : (
                    <span className={cn(
                      'flex-1 truncate text-[12px] font-medium',
                      isActive ? 'text-primary' : 'text-foreground/80'
                    )}>
                      {p.name}
                    </span>
                  )}

                  {/* Menu trigger */}
                  {!isRenaming && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setMenuOpenId(isMenuOpen ? null : p.id)
                        setConfirmDeleteId(null)
                        setConvertPickId(null)
                        setEditorsPickId(null)
                      }}
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-md transition-all',
                        isMenuOpen
                          ? 'bg-muted/60 text-foreground'
                          : 'text-muted-foreground/0 group-hover:text-muted-foreground/60 hover:bg-muted/40'
                      )}
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  )}
                </div>

                {/* Meta row */}
                {!isRenaming && (
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground/50">
                    <span>{formatTime(p.updatedAt)}</span>
                    {nodeN > 0 && <span>{nodeN} 节点</span>}
                    {isTeamScope && !canEdit && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-500/10 px-1 text-amber-500/90">
                        <Lock className="size-2.5" /> 只读
                      </span>
                    )}
                  </div>
                )}

                {/* Context menu */}
                {isMenuOpen && (
                  <div
                    ref={menuRef}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-full z-50 mt-1 w-[160px] overflow-hidden rounded-xl border border-border/40 bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-100"
                  >
                    {isEditorsPick ? (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground">可编辑成员</div>
                        <div className="max-h-44 overflow-y-auto">
                          {teamMembers.map((m) => {
                            const isEd = editors.includes(m.userId)
                            return (
                              <div key={m.userId} className="flex items-center gap-2 px-3 py-1.5">
                                <button
                                  onClick={() => updateProjectEditors(p.id, isEd ? 'remove' : 'add', m.userId)}
                                  className={cn(
                                    'flex size-4 shrink-0 items-center justify-center rounded border transition-colors',
                                    isEd ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60 hover:border-primary/50',
                                  )}
                                  title={isEd ? '取消编辑权' : '设为可编辑'}
                                >
                                  {isEd && <Check className="size-2.5" />}
                                </button>
                                <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/80">
                                  {m.username}{m.userId === userId && ' (我)'}
                                </span>
                                {!isEd && (
                                  <button
                                    onClick={() => updateProjectEditors(p.id, 'transfer', m.userId)}
                                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                                    title="转让编辑权（设为唯一可编辑）"
                                  >
                                    仅TA
                                  </button>
                                )}
                              </div>
                            )
                          })}
                          {teamMembers.length === 0 && (
                            <div className="px-3 py-2 text-[11px] text-muted-foreground/50">加载成员中…</div>
                          )}
                        </div>
                        <div className="mx-2 border-t border-border/30" />
                        <button
                          onClick={() => setEditorsPickId(null)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50"
                        >
                          <Check className="size-3" />
                          完成
                        </button>
                      </>
                    ) : isConvertPick ? (
                      <>
                        <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground">转为哪个团队？</div>
                        {teams.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => { convertToTeamProject(p.id, t.id); setConvertPickId(null); setMenuOpenId(null) }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground/80 transition-colors hover:bg-muted/50"
                          >
                            <Users className="size-3" />
                            <span className="truncate">{t.name}</span>
                          </button>
                        ))}
                        <div className="mx-2 border-t border-border/30" />
                        <button
                          onClick={() => setConvertPickId(null)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50"
                        >
                          <X className="size-3" />
                          取消
                        </button>
                      </>
                    ) : (
                      <>
                        {canEdit && (
                          <button
                            onClick={() => startRename(p)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground/80 transition-colors hover:bg-muted/50"
                          >
                            <Pencil className="size-3" />
                            重命名
                          </button>
                        )}
                        <button
                          onClick={() => handleDuplicate(p.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground/80 transition-colors hover:bg-muted/50"
                        >
                          <Copy className="size-3" />
                          复制项目
                        </button>
                        {scope === 'personal' && teams.length > 0 && (
                          <button
                            onClick={() => setConvertPickId(p.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground/80 transition-colors hover:bg-muted/50"
                          >
                            <Share2 className="size-3" />
                            转为团队项目
                          </button>
                        )}
                        {isTeamScope && canEdit && (
                          <button
                            onClick={() => openEditorsPicker(p.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-foreground/80 transition-colors hover:bg-muted/50"
                          >
                            <Users className="size-3" />
                            编辑权限
                          </button>
                        )}
                        {canEdit && <div className="mx-2 border-t border-border/30" />}
                        {canEdit && (isConfirmingDelete ? (
                          <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-[11px] text-destructive">确认删除？</span>
                            <div className="flex gap-1">
                              <button
                                onClick={() => handleDelete(p.id)}
                                className="flex size-5 items-center justify-center rounded bg-destructive text-white"
                              >
                                <Check className="size-3" />
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="flex size-5 items-center justify-center rounded bg-muted text-muted-foreground"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[12px] text-destructive transition-colors hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3" />
                            删除
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* User profile footer */}
      <UserProfileFooter />
    </div>
  )
}

function SaveStateBadge({
  status,
  hasUnsavedChanges,
  lastSavedAt,
  error,
  onRetry,
}: {
  status: 'idle' | 'dirty' | 'saving' | 'saved' | 'error'
  hasUnsavedChanges: boolean
  lastSavedAt: number | null
  error: string | null
  onRetry: () => void
}) {
  const savedText = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : ''
  const isSaving = status === 'saving'
  const isError = status === 'error'
  const isDirty = hasUnsavedChanges || status === 'dirty'
  const title = isSaving
    ? '正在保存'
    : isError
      ? `保存失败：${error ?? '点击重试'}`
      : isDirty
        ? '有未保存修改'
        : savedText
          ? `已保存 ${savedText}`
          : '已保存'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        if (isError || isDirty) onRetry()
      }}
      className={cn(
        'flex size-7 items-center justify-center rounded-lg transition-colors',
        isError
          ? 'text-destructive hover:bg-destructive/10'
          : isSaving
            ? 'text-primary'
            : isDirty
              ? 'text-amber-400 hover:bg-amber-500/10'
              : 'text-emerald-500/80 hover:bg-emerald-500/10',
      )}
      title={title}
      aria-label={title}
    >
      {isError ? (
        <AlertCircle className="size-3.5" />
      ) : isSaving ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : isDirty ? (
        <Save className="size-3.5" />
      ) : (
        <Cloud className="size-3.5" />
      )}
    </button>
  )
}

function UserProfileFooter() {
  const [user, setUser] = useState<{ id: string; username: string; email?: string; createdAt: string } | null>(null)
  const [cardOpen, setCardOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => {
        const u = d.user ?? null
        setUser(u)
        if (u?.id) initStoreForUser(u.id)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!cardOpen) return
    const handler = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) setCardOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [cardOpen])

  const handleLogout = async () => {
    initStoreForUser(null)
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  if (!user) return null

  const initial = user.username.charAt(0).toUpperCase()
  const joined = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  return (
    <div className="relative border-t border-border/30 px-3 py-2.5">
      <button
        onClick={() => setCardOpen(!cardOpen)}
        className="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted/40"
      >
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-[13px] font-bold text-white shadow-md shadow-primary/20">
          {initial}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-[12px] font-medium text-foreground/80">{user.username}</div>
          <div className="truncate text-[10px] text-muted-foreground/40">
            {user.email ?? '未绑定邮箱'}
          </div>
        </div>
      </button>

      {cardOpen && (
        <div
          ref={cardRef}
          className="absolute bottom-full left-3 right-3 z-50 mb-2 overflow-hidden rounded-2xl border border-border/40 bg-popover shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {/* Card header */}
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-primary/40 text-[16px] font-bold text-white shadow-lg shadow-primary/20">
              {initial}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-semibold text-foreground">{user.username}</div>
              {joined && (
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground/50">
                  <Calendar className="size-3" />
                  {joined} 加入
                </div>
              )}
            </div>
          </div>

          {/* Card info */}
          {user.email && (
            <div className="border-t border-border/20 px-4 py-2.5">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                <Mail className="size-3 shrink-0" />
                <span className="truncate">{user.email}</span>
              </div>
            </div>
          )}

          {/* Settings + Logout */}
          <div className="border-t border-border/20 p-1.5">
            <button
              onClick={() => { window.location.href = '/settings' }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-muted-foreground/70 transition-colors hover:bg-muted/30 hover:text-foreground"
            >
              <Settings className="size-3.5" />
              账号设置
            </button>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[12px] text-destructive/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-3.5" />
              退出登录
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
