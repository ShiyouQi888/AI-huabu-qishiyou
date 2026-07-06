import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { cookies } from 'next/headers'

const JWT_SECRET = process.env.JWT_SECRET || 'ai-canvas-secret-key-change-in-production'
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json')

export interface User {
  id: string
  username: string
  password?: string   // optional — OAuth users have no password
  email?: string
  googleId?: string
  avatar?: string
  createdAt: string
  updatedAt?: string
}

export interface SafeUser {
  id: string
  username: string
  email?: string
  avatar?: string
  createdAt: string
}

function ensureDataDir() {
  const dir = path.dirname(USERS_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '[]')
}

function readUsers(): User[] {
  ensureDataDir()
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writeUsers(users: User[]) {
  ensureDataDir()
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

export function toSafeUser(user: User): SafeUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    createdAt: user.createdAt,
  }
}

export function getUserByEmail(email: string): SafeUser | null {
  const users = readUsers()
  const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  return user ? toSafeUser(user) : null
}

export async function createUser(
  username: string,
  password: string,
  email?: string,
): Promise<SafeUser> {
  const users = readUsers()
  if (users.find((u) => u.username === username)) throw new Error('用户名已存在')
  if (email && users.find((u) => u.email?.toLowerCase() === email.toLowerCase())) {
    throw new Error('该邮箱已被注册')
  }
  const hashed = await bcrypt.hash(password, 10)
  const user: User = {
    id: crypto.randomUUID(),
    username,
    password: hashed,
    email,
    createdAt: new Date().toISOString(),
  }
  users.push(user)
  writeUsers(users)
  return toSafeUser(user)
}

export async function verifyUser(username: string, password: string): Promise<SafeUser> {
  const users = readUsers()
  const user = users.find((u) => u.username === username)
  if (!user || !user.password) throw new Error('用户名或密码错误')
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw new Error('用户名或密码错误')
  return toSafeUser(user)
}

/** Login with username OR email */
export async function verifyUserByLogin(login: string, password: string): Promise<SafeUser> {
  const users = readUsers()
  const isEmail = login.includes('@')
  const user = isEmail
    ? users.find((u) => u.email?.toLowerCase() === login.toLowerCase())
    : users.find((u) => u.username === login)
  if (!user || !user.password) throw new Error('账号或密码错误')
  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw new Error('账号或密码错误')
  return toSafeUser(user)
}

export async function updateEmail(userId: string, email: string): Promise<SafeUser> {
  const users = readUsers()
  const user = users.find((u) => u.id === userId)
  if (!user) throw new Error('用户不存在')
  if (users.find((u) => u.email?.toLowerCase() === email.toLowerCase() && u.id !== userId)) {
    throw new Error('该邮箱已被其他账号使用')
  }
  user.email = email
  user.updatedAt = new Date().toISOString()
  writeUsers(users)
  return toSafeUser(user)
}

export async function resetPasswordByEmail(email: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('密码至少 6 个字符')
  const users = readUsers()
  const user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (!user) throw new Error('该邮箱未注册')
  user.password = await bcrypt.hash(newPassword, 10)
  user.updatedAt = new Date().toISOString()
  writeUsers(users)
}

/** Find existing Google user or create one from OAuth profile */
export async function findOrCreateGoogleUser(opts: {
  googleId: string
  email: string
  name: string
  avatar?: string
}): Promise<SafeUser> {
  const users = readUsers()

  // 1. Match by googleId
  let user = users.find((u) => u.googleId === opts.googleId)

  // 2. Match by email (link existing account)
  if (!user) user = users.find((u) => u.email === opts.email && !!u.email)

  if (user) {
    let changed = false
    if (!user.googleId) { user.googleId = opts.googleId; changed = true }
    if (!user.avatar && opts.avatar) { user.avatar = opts.avatar; changed = true }
    if (!user.email && opts.email) { user.email = opts.email; changed = true }
    if (changed) { user.updatedAt = new Date().toISOString(); writeUsers(users) }
    return toSafeUser(user)
  }

  // 3. Create new user — derive username from name/email
  let base = opts.name.replace(/\s+/g, '').slice(0, 18) || opts.email.split('@')[0].slice(0, 18)
  if (base.length < 2) base = 'user'
  let username = base
  let n = 1
  while (users.find((u) => u.username === username)) {
    username = `${base.slice(0, 16)}${n++}`
  }

  const newUser: User = {
    id: crypto.randomUUID(),
    username,
    email: opts.email,
    googleId: opts.googleId,
    avatar: opts.avatar,
    createdAt: new Date().toISOString(),
  }
  users.push(newUser)
  writeUsers(users)
  return toSafeUser(newUser)
}

export function createToken(user: SafeUser): string {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
}

export function verifyToken(token: string): SafeUser | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; username: string }
    return { id: payload.id, username: payload.username, createdAt: '' }
  } catch {
    return null
  }
}

export function getUserById(id: string): SafeUser | null {
  const users = readUsers()
  const user = users.find((u) => u.id === id)
  return user ? toSafeUser(user) : null
}

/** Resolve current user from cookie — performs full JWT signature verification */
export async function getAuthUser(): Promise<SafeUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  if (!token) return null
  const user = verifyToken(token)
  if (!user) return null
  return getUserById(user.id) ?? user
}

export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 6) throw new Error('新密码至少 6 个字符')
  const users = readUsers()
  const user = users.find((u) => u.id === userId)
  if (!user) throw new Error('用户不存在')
  if (!user.password) throw new Error('该账号通过第三方登录，无法修改密码')
  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) throw new Error('当前密码错误')
  user.password = await bcrypt.hash(newPassword, 10)
  user.updatedAt = new Date().toISOString()
  writeUsers(users)
}

export async function updateProfile(
  userId: string,
  patch: { username?: string },
): Promise<SafeUser> {
  const users = readUsers()
  const user = users.find((u) => u.id === userId)
  if (!user) throw new Error('用户不存在')
  if (patch.username !== undefined) {
    const trimmed = patch.username.trim()
    if (trimmed.length < 2 || trimmed.length > 20) throw new Error('用户名长度需要 2-20 个字符')
    if (users.find((u) => u.username === trimmed && u.id !== userId)) throw new Error('用户名已被使用')
    user.username = trimmed
  }
  user.updatedAt = new Date().toISOString()
  writeUsers(users)
  return toSafeUser(user)
}

export interface UserMeta {
  hasPassword: boolean
  hasGoogle: boolean
}

export function getUserMeta(userId: string): UserMeta | null {
  const users = readUsers()
  const user = users.find((u) => u.id === userId)
  if (!user) return null
  return { hasPassword: !!user.password, hasGoogle: !!user.googleId }
}

export async function setPassword(userId: string, newPassword: string): Promise<void> {
  if (newPassword.length < 6) throw new Error('密码至少 6 个字符')
  const users = readUsers()
  const user = users.find((u) => u.id === userId)
  if (!user) throw new Error('用户不存在')
  if (user.password) throw new Error('该账号已设置密码，请使用修改密码功能')
  user.password = await bcrypt.hash(newPassword, 10)
  user.updatedAt = new Date().toISOString()
  writeUsers(users)
}
