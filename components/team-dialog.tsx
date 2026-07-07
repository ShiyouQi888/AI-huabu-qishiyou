'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users, X, Plus, LogIn, Copy, Check, Crown, Shield, User as UserIcon,
  UserPlus, Trash2, LogOut, Loader2, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type TeamRole = 'owner' | 'admin' | 'member'
interface TeamMember { userId: string; username: string; role: TeamRole; joinedAt: number }
interface Team {
  id: string
  name: string
  ownerId: string
  inviteCode: string
  members: TeamMember[]
  createdAt: number
  updatedAt: number
}

interface TeamDialogProps {
  open: boolean
  onClose: () => void
}

async function api<T = unknown>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
  return data as T
}

const ROLE_LABEL: Record<TeamRole, string> = { owner: '拥有者', admin: '管理员', member: '成员' }
const ROLE_ICON: Record<TeamRole, React.ReactNode> = {
  owner: <Crown className="size-3" />,
  admin: <Shield className="size-3" />,
  member: <UserIcon className="size-3" />,
}
const ROLE_CLASS: Record<TeamRole, string> = {
  owner: 'text-amber-500 bg-amber-500/10',
  admin: 'text-blue-400 bg-blue-400/10',
  member: 'text-muted-foreground bg-muted/50',
}

export function TeamDialog({ open, onClose }: TeamDialogProps) {
  const [teams, setTeams] = useState<Team[]>([])
  const [userId, setUserId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [newName, setNewName] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  const refresh = useCallback(async (selectId?: string) => {
    const data = await api<{ teams: Team[]; userId: string }>('/api/teams')
    setTeams(data.teams)
    setUserId(data.userId)
    setActiveId((prev) => {
      const want = selectId ?? prev
      return data.teams.find((t) => t.id === want)?.id ?? data.teams[0]?.id ?? null
    })
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError(null)
    refresh().catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [open, refresh])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : '操作失败') } finally { setBusy(false) }
  }, [])

  if (!open) return null

  const activeTeam = teams.find((t) => t.id === activeId) ?? null
  const myRole: TeamRole | null = activeTeam?.members.find((m) => m.userId === userId)?.role ?? null
  const canManage = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'

  const createTeam = () => run(async () => {
    const t = await api<Team>('/api/teams', { method: 'POST', body: JSON.stringify({ name: newName }) })
    setNewName('')
    setCreating(false)
    await refresh(t.id)
  })
  const joinTeam = () => run(async () => {
    const t = await api<Team>('/api/teams/join', { method: 'POST', body: JSON.stringify({ code: joinCode }) })
    setJoinCode('')
    setJoining(false)
    await refresh(t.id)
  })
  const invite = () => activeTeam && run(async () => {
    await api(`/api/teams/${activeTeam.id}/members`, { method: 'POST', body: JSON.stringify({ username: inviteName }) })
    setInviteName('')
    await refresh(activeTeam.id)
  })
  const changeRole = (m: TeamMember, role: TeamRole) => activeTeam && run(async () => {
    await api(`/api/teams/${activeTeam.id}/members`, { method: 'PATCH', body: JSON.stringify({ userId: m.userId, role }) })
    await refresh(activeTeam.id)
  })
  const removeMember = (m: TeamMember) => activeTeam && run(async () => {
    await api(`/api/teams/${activeTeam.id}/members?userId=${encodeURIComponent(m.userId)}`, { method: 'DELETE' })
    await refresh(activeTeam.id)
  })
  const leaveTeam = () => activeTeam && run(async () => {
    await api(`/api/teams/${activeTeam.id}/members?userId=${encodeURIComponent(userId ?? '')}`, { method: 'DELETE' })
    await refresh()
  })
  const deleteTeam = () => activeTeam && run(async () => {
    await api(`/api/teams/${activeTeam.id}`, { method: 'DELETE' })
    await refresh()
  })
  const copyCode = () => {
    if (!activeTeam) return
    navigator.clipboard?.writeText(activeTeam.inviteCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const canRemove = (m: TeamMember): boolean => {
    if (m.userId === userId) return false           // self leaves via footer button
    if (m.role === 'owner') return false
    if (myRole === 'owner') return true
    if (myRole === 'admin') return m.role === 'member'
    return false
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />

      <div className="glass relative z-10 flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/60 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-primary/15 text-primary"><Users className="size-4" /></span>
            <div>
              <h2 className="text-[15px] font-bold text-foreground">团队</h2>
              <p className="text-[11px] text-muted-foreground">邀请成员、分配角色、协作管理</p>
            </div>
          </div>
          <button onClick={onClose} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" title="关闭 (Esc)">
            <X className="size-4" />
          </button>
        </div>

        {/* Team selector row */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 px-5 py-2.5">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors',
                t.id === activeId ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted/70',
              )}
            >
              <Users className="size-3" />
              {t.name}
            </button>
          ))}
          <button onClick={() => { setCreating((v) => !v); setJoining(false) }} className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
            <Plus className="size-3" /> 创建
          </button>
          <button onClick={() => { setJoining((v) => !v); setCreating(false) }} className="flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
            <LogIn className="size-3" /> 加入
          </button>
        </div>

        {/* Create / Join inline forms */}
        {(creating || joining) && (
          <div className="flex items-center gap-2 border-b border-border/40 bg-muted/10 px-5 py-2.5">
            {creating ? (
              <>
                <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createTeam()}
                  placeholder="新团队名称…" className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-1.5 text-[13px] outline-none focus:border-primary/50" />
                <button onClick={createTeam} disabled={busy || !newName.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40">创建团队</button>
              </>
            ) : (
              <>
                <input autoFocus value={joinCode} onChange={(e) => setJoinCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && joinTeam()}
                  placeholder="输入邀请码…" className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-1.5 text-[13px] uppercase outline-none focus:border-primary/50" />
                <button onClick={joinTeam} disabled={busy || !joinCode.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40">加入团队</button>
              </>
            )}
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-1.5 border-b border-red-500/20 bg-red-500/5 px-5 py-2 text-[12px] text-red-400">
            <AlertCircle className="size-3.5" /> {error}
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : !activeTeam ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Users className="size-8 text-muted-foreground/40" />
              <p className="text-[13px] text-muted-foreground">你还没有加入任何团队</p>
              <p className="text-[12px] text-muted-foreground/60">点击上方「创建」新建团队，或用邀请码「加入」现有团队</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Invite code */}
              <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/10 px-3.5 py-2.5">
                <div>
                  <div className="text-[11px] text-muted-foreground">邀请码</div>
                  <div className="mt-0.5 font-mono text-[15px] font-bold tracking-widest text-foreground">{activeTeam.inviteCode}</div>
                </div>
                <button onClick={copyCode} className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                  {copied ? <><Check className="size-3.5 text-emerald-500" /> 已复制</> : <><Copy className="size-3.5" /> 复制</>}
                </button>
              </div>

              {/* Invite member */}
              {canManage && (
                <div className="flex items-center gap-2">
                  <UserPlus className="size-4 shrink-0 text-muted-foreground" />
                  <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && invite()}
                    placeholder="输入用户名邀请成员…" className="flex-1 rounded-lg border border-border/50 bg-background/60 px-3 py-1.5 text-[13px] outline-none focus:border-primary/50" />
                  <button onClick={invite} disabled={busy || !inviteName.trim()} className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground disabled:opacity-40">邀请</button>
                </div>
              )}

              {/* Members */}
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  成员 · {activeTeam.members.length}
                </div>
                <div className="overflow-hidden rounded-xl border border-border/40">
                  {activeTeam.members.map((m, i) => (
                    <div key={m.userId} className={cn('flex items-center gap-3 px-3.5 py-2.5', i > 0 && 'border-t border-border/30')}>
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-bold uppercase text-primary">
                        {m.username.slice(0, 1)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {m.username}{m.userId === userId && <span className="ml-1 text-[11px] text-muted-foreground">（我）</span>}
                        </div>
                      </div>

                      {/* Role: owner can switch admin/member for non-owner members */}
                      {isOwner && m.role !== 'owner' ? (
                        <select
                          value={m.role}
                          onChange={(e) => changeRole(m, e.target.value as TeamRole)}
                          disabled={busy}
                          className="rounded-md border border-border/50 bg-background/60 px-1.5 py-1 text-[11px] text-foreground/80 outline-none"
                        >
                          <option value="admin">管理员</option>
                          <option value="member">成员</option>
                        </select>
                      ) : (
                        <span className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium', ROLE_CLASS[m.role])}>
                          {ROLE_ICON[m.role]} {ROLE_LABEL[m.role]}
                        </span>
                      )}

                      {canRemove(m) && (
                        <button onClick={() => removeMember(m)} disabled={busy} title="移除成员"
                          className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive hover:text-white">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {activeTeam && (
          <div className="flex items-center justify-between border-t border-border/40 px-5 py-3">
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              我的角色：
              <span className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 font-medium', myRole ? ROLE_CLASS[myRole] : '')}>
                {myRole && ROLE_ICON[myRole]} {myRole ? ROLE_LABEL[myRole] : '—'}
              </span>
            </span>
            {isOwner ? (
              <button onClick={deleteTeam} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40">
                <Trash2 className="size-3.5" /> 解散团队
              </button>
            ) : (
              <button onClick={leaveTeam} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-border/50 px-3 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-40">
                <LogOut className="size-3.5" /> 退出团队
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
