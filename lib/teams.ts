/**
 * Team data layer — file-backed (data/teams.json), mirroring lib/auth.ts.
 * Roles: owner > admin > member.
 */

import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const TEAMS_FILE = path.join(DATA_DIR, 'teams.json')

export type TeamRole = 'owner' | 'admin' | 'member'

export interface TeamMember {
  userId: string
  username: string
  role: TeamRole
  joinedAt: number
}

export interface Team {
  id: string
  name: string
  ownerId: string
  inviteCode: string
  members: TeamMember[]
  createdAt: number
  updatedAt: number
}

export class TeamError extends Error {
  statusCode: number
  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'TeamError'
    this.statusCode = statusCode
  }
}

/** Map thrown errors to a JSON response for route handlers. */
export function teamErrorResponse(e: unknown) {
  if (e instanceof TeamError) return NextResponse.json({ error: e.message }, { status: e.statusCode })
  console.error('Team error:', e)
  return NextResponse.json({ error: '操作失败' }, { status: 500 })
}

async function ensureDir() { await mkdir(DATA_DIR, { recursive: true }) }

async function readTeams(): Promise<Team[]> {
  try {
    await ensureDir()
    if (!existsSync(TEAMS_FILE)) return []
    return JSON.parse(await readFile(TEAMS_FILE, 'utf-8')) as Team[]
  } catch {
    return []
  }
}

async function writeTeams(teams: Team[]): Promise<void> {
  await ensureDir()
  await writeFile(TEAMS_FILE, JSON.stringify(teams, null, 2))
}

const genId = () => `team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
const genCode = () => Math.random().toString(36).slice(2, 8).toUpperCase()

export function roleOf(team: Team, userId: string): TeamRole | null {
  return team.members.find((m) => m.userId === userId)?.role ?? null
}
export function isMember(team: Team, userId: string): boolean {
  return team.members.some((m) => m.userId === userId)
}
function canManage(role: TeamRole | null): boolean {
  return role === 'owner' || role === 'admin'
}

// ── queries ──────────────────────────────────────────────────────────────────

export async function getTeamsForUser(userId: string): Promise<Team[]> {
  const teams = await readTeams()
  return teams
    .filter((t) => isMember(t, userId))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getTeamForUser(teamId: string, userId: string): Promise<Team> {
  const teams = await readTeams()
  const t = teams.find((x) => x.id === teamId)
  if (!t) throw new TeamError('团队不存在', 404)
  if (!isMember(t, userId)) throw new TeamError('你不是该团队成员', 403)
  return t
}

/** Whether a user belongs to a team — for scoping shared resources (assets, etc.). */
export async function userInTeam(teamId: string, userId: string): Promise<boolean> {
  const teams = await readTeams()
  const t = teams.find((x) => x.id === teamId)
  return !!t && isMember(t, userId)
}

/**
 * Resolve a scoped storage id used for per-user vs per-team data files:
 * - 'personal' / empty → the caller's own id
 * - a team id           → the same id, but only after verifying membership (else 403)
 * Guarantees a client can never point storage at another user's file.
 */
export async function resolveScopeStoreId(userId: string, scope: string | null | undefined): Promise<string> {
  if (!scope || scope === 'personal') return userId
  const ok = await userInTeam(scope, userId)
  if (!ok) throw new TeamError('你不是该团队成员', 403)
  return scope
}

// ── mutations ────────────────────────────────────────────────────────────────

export async function createTeam(owner: { id: string; username: string }, name: string): Promise<Team> {
  const teams = await readTeams()
  const now = Date.now()
  const team: Team = {
    id: genId(),
    name: name.trim() || '未命名团队',
    ownerId: owner.id,
    inviteCode: genCode(),
    members: [{ userId: owner.id, username: owner.username, role: 'owner', joinedAt: now }],
    createdAt: now,
    updatedAt: now,
  }
  teams.unshift(team)
  await writeTeams(teams)
  return team
}

export async function renameTeam(teamId: string, actorId: string, name: string): Promise<Team> {
  const teams = await readTeams()
  const t = teams.find((x) => x.id === teamId)
  if (!t) throw new TeamError('团队不存在', 404)
  if (!canManage(roleOf(t, actorId))) throw new TeamError('无权限重命名团队', 403)
  const trimmed = name.trim()
  if (!trimmed) throw new TeamError('团队名称不能为空', 400)
  t.name = trimmed
  t.updatedAt = Date.now()
  await writeTeams(teams)
  return t
}

export async function deleteTeam(teamId: string, actorId: string): Promise<void> {
  const teams = await readTeams()
  const t = teams.find((x) => x.id === teamId)
  if (!t) throw new TeamError('团队不存在', 404)
  if (t.ownerId !== actorId) throw new TeamError('仅拥有者可删除团队', 403)
  await writeTeams(teams.filter((x) => x.id !== teamId))
}

export async function addMember(
  teamId: string,
  actorId: string,
  user: { id: string; username: string },
  role: TeamRole = 'member',
): Promise<Team> {
  const teams = await readTeams()
  const t = teams.find((x) => x.id === teamId)
  if (!t) throw new TeamError('团队不存在', 404)
  if (!canManage(roleOf(t, actorId))) throw new TeamError('无权限邀请成员', 403)
  if (isMember(t, user.id)) throw new TeamError('该用户已是团队成员', 409)
  const safeRole: TeamRole = role === 'owner' ? 'member' : role // owner is not assignable here
  t.members.push({ userId: user.id, username: user.username, role: safeRole, joinedAt: Date.now() })
  t.updatedAt = Date.now()
  await writeTeams(teams)
  return t
}

export async function joinByCode(code: string, user: { id: string; username: string }): Promise<Team> {
  const teams = await readTeams()
  const t = teams.find((x) => x.inviteCode.toUpperCase() === code.trim().toUpperCase())
  if (!t) throw new TeamError('邀请码无效', 404)
  if (isMember(t, user.id)) throw new TeamError('你已经是该团队成员', 409)
  t.members.push({ userId: user.id, username: user.username, role: 'member', joinedAt: Date.now() })
  t.updatedAt = Date.now()
  await writeTeams(teams)
  return t
}

/** Remove a member. `actorId === targetUserId` means leaving the team. */
export async function removeMember(teamId: string, actorId: string, targetUserId: string): Promise<Team> {
  const teams = await readTeams()
  const t = teams.find((x) => x.id === teamId)
  if (!t) throw new TeamError('团队不存在', 404)
  const isSelf = actorId === targetUserId
  const actorRole = roleOf(t, actorId)
  if (!isSelf && !canManage(actorRole)) throw new TeamError('无权限移除成员', 403)
  if (targetUserId === t.ownerId) throw new TeamError('不能移除团队拥有者（请先转让或解散团队）', 400)
  const targetRole = roleOf(t, targetUserId)
  if (!targetRole) throw new TeamError('该用户不是团队成员', 404)
  if (!isSelf && actorRole === 'admin' && targetRole === 'admin') {
    throw new TeamError('管理员不能移除其他管理员', 403)
  }
  t.members = t.members.filter((m) => m.userId !== targetUserId)
  t.updatedAt = Date.now()
  await writeTeams(teams)
  return t
}

export async function updateMemberRole(
  teamId: string,
  actorId: string,
  targetUserId: string,
  role: TeamRole,
): Promise<Team> {
  const teams = await readTeams()
  const t = teams.find((x) => x.id === teamId)
  if (!t) throw new TeamError('团队不存在', 404)
  if (t.ownerId !== actorId) throw new TeamError('仅拥有者可调整成员角色', 403)
  if (targetUserId === t.ownerId) throw new TeamError('不能修改拥有者角色', 400)
  const m = t.members.find((x) => x.userId === targetUserId)
  if (!m) throw new TeamError('成员不存在', 404)
  m.role = role === 'owner' ? 'admin' : role // owner can't be reassigned here
  t.updatedAt = Date.now()
  await writeTeams(teams)
  return t
}
